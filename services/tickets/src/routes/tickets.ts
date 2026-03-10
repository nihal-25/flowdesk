import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@flowdesk/database';
import { publishEvent } from '@flowdesk/kafka';
import { KAFKA_TOPICS, TICKET_STATUS_TRANSITIONS } from '@flowdesk/shared';
import type {
  TicketCreatedEvent,
  TicketUpdatedEvent,
  TicketAssignedEvent,
  TicketResolvedEvent,
  MessageSentEvent,
} from '@flowdesk/shared';
import { authenticate } from '../middleware/auth.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InvalidStatusTransitionError,
} from '../errors.js';

export const ticketsRouter = Router();

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignedTo: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  customerId: z.string().uuid().optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const createMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  messageType: z.enum(['text', 'note']).default('text'),
});

const ticketFiltersSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedTo: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().max(100).default(25),
  sortBy: z.enum(['created_at', 'updated_at', 'priority']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── POST /tickets ────────────────────────────────────────────────────────────

ticketsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid ticket data', parsed.error.flatten());
    }

    const { title, description, priority, assignedTo, tags, customerId } = parsed.data;
    const { userId, tenantId } = req.auth;
    const ticketId = uuidv4();
    const now = new Date();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO tickets (id, tenant_id, customer_id, assigned_to, title, description, status, priority, tags, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $9)`,
        [
          ticketId,
          tenantId,
          customerId ?? null,
          assignedTo ?? null,
          title,
          description,
          priority,
          JSON.stringify(tags),
          now,
        ],
      );

      await client.query(
        `INSERT INTO ticket_events (id, ticket_id, user_id, event_type, old_value, new_value, created_at)
         VALUES ($1, $2, $3, 'created', NULL, $4, $5)`,
        [uuidv4(), ticketId, userId, JSON.stringify({ title, priority, status: 'open' }), now],
      );
    });

    const ticket = await queryOne<Record<string, unknown>>(
      `SELECT t.*, u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              u.email AS assignee_email, u.avatar_url AS assignee_avatar_url
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.id = $1`,
      [ticketId],
    );

    const event: TicketCreatedEvent = {
      topic: KAFKA_TOPICS.TICKET_CREATED,
      tenantId,
      ticketId,
      title,
      priority,
      customerId: customerId ?? null,
      createdByUserId: userId,
      assignedTo: assignedTo ?? null,
      requestId: req.auth.requestId,
      timestamp: now.toISOString(),
    };
    await publishEvent(KAFKA_TOPICS.TICKET_CREATED, event);

    res.status(201).json({
      success: true,
      data: mapTicket(ticket ?? {}),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /tickets ─────────────────────────────────────────────────────────────

ticketsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const parsed = ticketFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query params', parsed.error.flatten());
    }

    const filters = parsed.data;
    const { tenantId } = req.auth;

    const conditions: string[] = ['t.tenant_id = $1', 't.is_deleted = false'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`t.status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters.priority) {
      conditions.push(`t.priority = $${paramIndex++}`);
      params.push(filters.priority);
    }
    if (filters.assignedTo) {
      conditions.push(`t.assigned_to = $${paramIndex++}`);
      params.push(filters.assignedTo);
    }
    if (filters.search) {
      conditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    if (filters.dateFrom) {
      conditions.push(`t.created_at >= $${paramIndex++}`);
      params.push(new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      conditions.push(`t.created_at <= $${paramIndex++}`);
      params.push(new Date(filters.dateTo));
    }

    const where = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.pageSize;

    // Safe sort column whitelist (never from user input directly)
    const sortByColumn = filters.sortBy === 'priority'
      ? `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`
      : `t.${filters.sortBy}`;
    const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM tickets t WHERE ${where}`,
      params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const tickets = await query<Record<string, unknown>>(
      `SELECT t.*, u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              u.email AS assignee_email, u.avatar_url AS assignee_avatar_url,
              (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id) AS last_message_at
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE ${where}
       ORDER BY ${sortByColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, filters.pageSize, offset],
    );

    res.json({
      success: true,
      data: {
        tickets: tickets.rows.map(mapTicketWithDetails),
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        totalPages: Math.ceil(total / filters.pageSize),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /tickets/:id ─────────────────────────────────────────────────────────

ticketsRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Ticket'));

    const ticket = await queryOne<Record<string, unknown>>(
      `SELECT t.*, u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              u.email AS assignee_email, u.avatar_url AS assignee_avatar_url
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.id = $1 AND t.tenant_id = $2 AND t.is_deleted = false`,
      [id, tenantId],
    );

    if (!ticket) throw new NotFoundError('Ticket');

    const messages = await query<Record<string, unknown>>(
      `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.role AS sender_role, u.avatar_url AS sender_avatar_url
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [id],
    );

    const events = await query<Record<string, unknown>>(
      `SELECT te.*, u.first_name AS user_first_name, u.last_name AS user_last_name, u.role AS user_role
       FROM ticket_events te
       LEFT JOIN users u ON u.id = te.user_id
       WHERE te.ticket_id = $1
       ORDER BY te.created_at ASC`,
      [id],
    );

    res.json({
      success: true,
      data: {
        ...mapTicketWithDetails(ticket),
        messages: messages.rows.map(mapMessage),
        events: events.rows.map(mapEvent),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /tickets/:id ───────────────────────────────────────────────────────

ticketsRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid update data', parsed.error.flatten());
    }

    const updates = parsed.data;
    const { tenantId, userId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Ticket'));

    const existing = await queryOne<{
      id: string;
      status: string;
      priority: string;
      title: string;
      description: string;
      assigned_to: string | null;
      tags: string;
      customer_id: string | null;
      created_at: Date;
    }>(
      `SELECT id, status, priority, title, description, assigned_to, tags, customer_id, created_at
       FROM tickets WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
      [id, tenantId],
    );

    if (!existing) throw new NotFoundError('Ticket');

    // Validate status transition
    if (updates.status && updates.status !== existing.status) {
      const allowedTransitions = TICKET_STATUS_TRANSITIONS[existing.status as keyof typeof TICKET_STATUS_TRANSITIONS];
      if (!allowedTransitions || !allowedTransitions.includes(updates.status as never)) {
        throw new InvalidStatusTransitionError(existing.status, updates.status);
      }
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;
    const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

    if (updates.title !== undefined && updates.title !== existing.title) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(updates.title);
      changes.push({ field: 'title', oldValue: existing.title, newValue: updates.title });
    }
    if (updates.description !== undefined && updates.description !== existing.description) {
      setClauses.push(`description = $${paramIndex++}`);
      params.push(updates.description);
      changes.push({ field: 'description', oldValue: existing.description, newValue: updates.description });
    }
    if (updates.status !== undefined && updates.status !== existing.status) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(updates.status);
      if (updates.status === 'resolved') {
        setClauses.push('resolved_at = NOW()');
      }
      changes.push({ field: 'status', oldValue: existing.status, newValue: updates.status });
    }
    if (updates.priority !== undefined && updates.priority !== existing.priority) {
      setClauses.push(`priority = $${paramIndex++}`);
      params.push(updates.priority);
      changes.push({ field: 'priority', oldValue: existing.priority, newValue: updates.priority });
    }
    if ('assignedTo' in updates) {
      setClauses.push(`assigned_to = $${paramIndex++}`);
      params.push(updates.assignedTo ?? null);
      changes.push({ field: 'assigned_to', oldValue: existing.assigned_to, newValue: updates.assignedTo ?? null });
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      params.push(JSON.stringify(updates.tags));
      changes.push({ field: 'tags', oldValue: existing.tags, newValue: JSON.stringify(updates.tags) });
    }

    if (params.length > 0) {
      params.push(id, tenantId);
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE tickets SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
          params,
        );

        for (const change of changes) {
          await client.query(
            `INSERT INTO ticket_events (id, ticket_id, user_id, event_type, old_value, new_value, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              uuidv4(),
              id,
              userId,
              change.field === 'status' ? 'status_changed'
                : change.field === 'priority' ? 'priority_changed'
                : change.field === 'assigned_to'
                  ? (updates.assignedTo ? 'assigned' : 'unassigned')
                  : 'status_changed',
              change.oldValue,
              change.newValue,
            ],
          );
        }
      });
    }

    // Publish Kafka events
    const now = new Date().toISOString();
    if (changes.length > 0) {
      const updatedEvent: TicketUpdatedEvent = {
        topic: KAFKA_TOPICS.TICKET_UPDATED,
        tenantId,
        ticketId: id,
        updatedByUserId: userId,
        changes,
        requestId: req.auth.requestId,
        timestamp: now,
      };
      await publishEvent(KAFKA_TOPICS.TICKET_UPDATED, updatedEvent);
    }

    if (updates.assignedTo !== undefined && updates.assignedTo !== existing.assigned_to) {
      const assignedEvent: TicketAssignedEvent = {
        topic: KAFKA_TOPICS.TICKET_ASSIGNED,
        tenantId,
        ticketId: id,
        title: updates.title ?? existing.title,
        assignedToUserId: updates.assignedTo ?? userId,
        assignedByUserId: userId,
        previousAssigneeId: existing.assigned_to,
        requestId: req.auth.requestId,
        timestamp: now,
      };
      await publishEvent(KAFKA_TOPICS.TICKET_ASSIGNED, assignedEvent);
    }

    if (updates.status === 'resolved') {
      const resolvedEvent: TicketResolvedEvent = {
        topic: KAFKA_TOPICS.TICKET_RESOLVED,
        tenantId,
        ticketId: id,
        title: updates.title ?? existing.title,
        resolvedByUserId: userId,
        customerId: existing.customer_id,
        resolutionTimeMs: Date.now() - new Date(existing.created_at).getTime(),
        requestId: req.auth.requestId,
        timestamp: now,
      };
      await publishEvent(KAFKA_TOPICS.TICKET_RESOLVED, resolvedEvent);
    }

    const updated = await queryOne<Record<string, unknown>>(
      `SELECT t.*, u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              u.email AS assignee_email, u.avatar_url AS assignee_avatar_url
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.id = $1`,
      [id],
    );

    res.json({
      success: true,
      data: mapTicketWithDetails(updated ?? {}),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /tickets/:id ──────────────────────────────────────────────────────

ticketsRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { tenantId, userId, role } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Ticket'));

    if (role !== 'admin' && role !== 'superadmin') {
      throw new ForbiddenError('Only admins can delete tickets');
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
      [id, tenantId],
    );

    if (!existing) throw new NotFoundError('Ticket');

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE tickets SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      await client.query(
        `INSERT INTO ticket_events (id, ticket_id, user_id, event_type, old_value, new_value, created_at)
         VALUES ($1, $2, $3, 'closed', NULL, 'deleted', NOW())`,
        [uuidv4(), id, userId],
      );
    });

    res.json({
      success: true,
      data: { deleted: true },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /tickets/:id/messages ───────────────────────────────────────────────

ticketsRouter.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid message data', parsed.error.flatten());
    }

    const { body, messageType } = parsed.data;
    const { tenantId, userId } = req.auth;
    const ticketId = req.params['id'];
    if (!ticketId) return next(new NotFoundError('Ticket'));

    const ticket = await queryOne<{ id: string }>(
      `SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
      [ticketId, tenantId],
    );

    if (!ticket) throw new NotFoundError('Ticket');

    const messageId = uuidv4();
    const now = new Date();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO messages (id, ticket_id, sender_id, body, message_type, is_read, attachments, created_at)
         VALUES ($1, $2, $3, $4, $5, false, '[]', $6)`,
        [messageId, ticketId, userId, body, messageType, now],
      );

      await client.query(
        `UPDATE tickets SET updated_at = $1 WHERE id = $2`,
        [now, ticketId],
      );

      await client.query(
        `INSERT INTO ticket_events (id, ticket_id, user_id, event_type, old_value, new_value, created_at)
         VALUES ($1, $2, $3, 'message_added', NULL, $4, $5)`,
        [uuidv4(), ticketId, userId, messageId, now],
      );
    });

    const event: MessageSentEvent = {
      topic: KAFKA_TOPICS.MESSAGE_SENT,
      tenantId,
      ticketId,
      messageId,
      senderId: userId,
      messageType,
      requestId: req.auth.requestId,
      timestamp: now.toISOString(),
    };
    await publishEvent(KAFKA_TOPICS.MESSAGE_SENT, event);

    const message = await queryOne<Record<string, unknown>>(
      `SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.role AS sender_role, u.avatar_url AS sender_avatar_url
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1`,
      [messageId],
    );

    res.status(201).json({
      success: true,
      data: mapMessage(message ?? {}),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapTicket(row: Record<string, unknown>) {
  return {
    id: row['id'],
    tenantId: row['tenant_id'],
    customerId: row['customer_id'] ?? null,
    assignedTo: row['assigned_to'] ?? null,
    title: row['title'],
    description: row['description'],
    status: row['status'],
    priority: row['priority'],
    tags: row['tags'] ? (typeof row['tags'] === 'string' ? JSON.parse(row['tags']) : row['tags']) : [],
    resolvedAt: row['resolved_at'] ?? null,
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

function mapTicketWithDetails(row: Record<string, unknown>) {
  const base = mapTicket(row);
  return {
    ...base,
    assignee: row['assignee_first_name']
      ? {
          id: row['assigned_to'],
          firstName: row['assignee_first_name'],
          lastName: row['assignee_last_name'],
          email: row['assignee_email'],
          avatarUrl: row['assignee_avatar_url'] ?? null,
        }
      : null,
    messageCount: parseInt(String(row['message_count'] ?? '0'), 10),
    lastMessageAt: row['last_message_at'] ?? null,
  };
}

function mapMessage(row: Record<string, unknown>) {
  return {
    id: row['id'],
    ticketId: row['ticket_id'],
    senderId: row['sender_id'] ?? null,
    body: row['body'],
    messageType: row['message_type'],
    isRead: row['is_read'],
    attachments: row['attachments']
      ? (typeof row['attachments'] === 'string' ? JSON.parse(row['attachments']) : row['attachments'])
      : [],
    createdAt: row['created_at'],
    sender: row['sender_first_name']
      ? {
          id: row['sender_id'],
          firstName: row['sender_first_name'],
          lastName: row['sender_last_name'],
          role: row['sender_role'],
          avatarUrl: row['sender_avatar_url'] ?? null,
        }
      : null,
  };
}

function mapEvent(row: Record<string, unknown>) {
  return {
    id: row['id'],
    ticketId: row['ticket_id'],
    userId: row['user_id'] ?? null,
    eventType: row['event_type'],
    oldValue: row['old_value'] ?? null,
    newValue: row['new_value'] ?? null,
    createdAt: row['created_at'],
    user: row['user_first_name']
      ? {
          id: row['user_id'],
          firstName: row['user_first_name'],
          lastName: row['user_last_name'],
          role: row['user_role'],
        }
      : null,
  };
}

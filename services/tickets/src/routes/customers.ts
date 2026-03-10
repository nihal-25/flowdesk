import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '@flowdesk/database';
import { publishEvent } from '@flowdesk/kafka';
import { KAFKA_TOPICS } from '@flowdesk/shared';
import type { TicketCreatedEvent } from '@flowdesk/shared';
import { ValidationError, AuthError, NotFoundError } from '../errors.js';

export const customersRouter = Router();

const createCustomerTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  customerId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

// ─── POST /customers/tickets — Public endpoint (API key required) ─────────────

customersRouter.post('/tickets', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      throw new AuthError('API key required');
    }

    // Look up tenant by API key hash
    const { hashToken } = await import('@flowdesk/shared');
    const keyHash = hashToken(apiKey);

    const keyRow = await queryOne<{ tenant_id: string; user_id: string; is_active: boolean; expires_at: Date | null }>(
      `SELECT tenant_id, user_id, is_active, expires_at FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );

    if (!keyRow || !keyRow.is_active) {
      throw new AuthError('Invalid or inactive API key');
    }
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      throw new AuthError('API key expired');
    }

    const parsed = createCustomerTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid ticket data', parsed.error.flatten());
    }

    const { title, description, priority, customerId } = parsed.data;
    const tenantId = keyRow.tenant_id;
    const ticketId = uuidv4();
    const now = new Date();

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO tickets (id, tenant_id, customer_id, assigned_to, title, description, status, priority, tags, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $5, 'open', $6, '[]', $7, $7)`,
        [ticketId, tenantId, customerId ?? null, title, description, priority, now],
      );

      await client.query(
        `INSERT INTO ticket_events (id, ticket_id, user_id, event_type, old_value, new_value, created_at)
         VALUES ($1, $2, NULL, 'created', NULL, $3, $4)`,
        [uuidv4(), ticketId, JSON.stringify({ title, priority, status: 'open' }), now],
      );
    });

    // Update api_key last_used_at
    await query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`,
      [keyHash],
    );

    const event: TicketCreatedEvent = {
      topic: KAFKA_TOPICS.TICKET_CREATED,
      tenantId,
      ticketId,
      title,
      priority,
      customerId: customerId ?? null,
      createdByUserId: keyRow.user_id,
      assignedTo: null,
      requestId: uuidv4(),
      timestamp: now.toISOString(),
    };
    await publishEvent(KAFKA_TOPICS.TICKET_CREATED, event);

    res.status(201).json({
      success: true,
      data: { id: ticketId, title, status: 'open', priority, createdAt: now },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /customers/tickets/:id ───────────────────────────────────────────────

customersRouter.get('/tickets/:id', async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      throw new AuthError('API key required');
    }

    const { hashToken } = await import('@flowdesk/shared');
    const keyHash = hashToken(apiKey);

    const keyRow = await queryOne<{ tenant_id: string; is_active: boolean }>(
      `SELECT tenant_id, is_active FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );

    if (!keyRow || !keyRow.is_active) {
      throw new AuthError('Invalid or inactive API key');
    }

    const { id } = req.params;
    const ticket = await queryOne<Record<string, unknown>>(
      `SELECT id, title, description, status, priority, created_at, updated_at, resolved_at
       FROM tickets WHERE id = $1 AND tenant_id = $2 AND is_deleted = false`,
      [id, keyRow.tenant_id],
    );

    if (!ticket) throw new NotFoundError('Ticket');

    res.json({
      success: true,
      data: {
        id: ticket['id'],
        title: ticket['title'],
        description: ticket['description'],
        status: ticket['status'],
        priority: ticket['priority'],
        createdAt: ticket['created_at'],
        updatedAt: ticket['updated_at'],
        resolvedAt: ticket['resolved_at'] ?? null,
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

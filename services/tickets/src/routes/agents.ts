import { Router } from 'express';
import { query, queryOne } from '@flowdesk/database';
import { getOnlineUsers } from '@flowdesk/redis';
import { authenticate } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors.js';

export const agentsRouter = Router();

// ─── GET /agents ──────────────────────────────────────────────────────────────

agentsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;

    // Include inactive members so the Agents page can show status and re-activate.
    const agents = await query<Record<string, unknown>>(
      `SELECT id, tenant_id, email, first_name, last_name, role, is_active, avatar_url, last_login_at, created_at
       FROM users
       WHERE tenant_id = $1 AND role IN ('admin', 'agent', 'superadmin')
       ORDER BY is_active DESC, first_name ASC, last_name ASC`,
      [tenantId],
    );

    const onlineUserIds = await getOnlineUsers(tenantId);
    const onlineSet = new Set(onlineUserIds);

    const agentsWithPresence = agents.rows.map((agent) => ({
      id: agent['id'],
      tenantId: agent['tenant_id'],
      email: agent['email'],
      firstName: agent['first_name'],
      lastName: agent['last_name'],
      role: agent['role'],
      isActive: agent['is_active'],
      avatarUrl: agent['avatar_url'] ?? null,
      lastLoginAt: agent['last_login_at'] ?? null,
      createdAt: agent['created_at'],
      isOnline: onlineSet.has(String(agent['id'])),
    }));

    res.json({
      success: true,
      data: agentsWithPresence,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /agents/:id ────────────────────────────────────────────────────────
// Update a team member's role and/or active status. Admin-only.
agentsRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const { tenantId, userId, role: callerRole } = req.auth;
    if (!['admin', 'superadmin'].includes(callerRole)) {
      throw new ForbiddenError('Only admins can modify team members');
    }
    const { id } = req.params;
    const { role, isActive } = req.body as { role?: unknown; isActive?: unknown };

    if (role === undefined && isActive === undefined) {
      throw new ValidationError('Nothing to update — provide role and/or isActive');
    }
    if (role !== undefined && role !== 'admin' && role !== 'agent') {
      throw new ValidationError("role must be 'admin' or 'agent'");
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean');
    }
    // Prevent locking yourself out of your own workspace.
    if (id === userId && isActive === false) {
      throw new ForbiddenError('You cannot deactivate your own account');
    }

    const target = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!target) throw new NotFoundError('Agent');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (role !== undefined) { setClauses.push(`role = $${i++}`); params.push(role); }
    if (isActive !== undefined) { setClauses.push(`is_active = $${i++}`); params.push(isActive); }
    params.push(id, tenantId);

    const updated = await queryOne<Record<string, unknown>>(
      `UPDATE users SET ${setClauses.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, email, first_name, last_name, role, is_active, avatar_url, last_login_at, created_at`,
      params,
    );
    if (!updated) throw new NotFoundError('Agent');

    const onlineSet = new Set(await getOnlineUsers(tenantId));
    res.json({
      success: true,
      data: {
        id: updated['id'],
        tenantId: updated['tenant_id'],
        email: updated['email'],
        firstName: updated['first_name'],
        lastName: updated['last_name'],
        role: updated['role'],
        isActive: updated['is_active'],
        avatarUrl: updated['avatar_url'] ?? null,
        lastLoginAt: updated['last_login_at'] ?? null,
        createdAt: updated['created_at'],
        isOnline: onlineSet.has(String(updated['id'])),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/:id/tickets ──────────────────────────────────────────────────

agentsRouter.get('/:id/tickets', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const { id: agentId } = req.params;

    const agent = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND role IN ('admin', 'agent', 'superadmin')`,
      [agentId, tenantId],
    );

    if (!agent) throw new NotFoundError('Agent');

    const tickets = await query<Record<string, unknown>>(
      `SELECT t.*, u.first_name AS assignee_first_name, u.last_name AS assignee_last_name,
              u.email AS assignee_email, u.avatar_url AS assignee_avatar_url,
              (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id) AS last_message_at
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.tenant_id = $1 AND t.assigned_to = $2 AND t.is_deleted = false
       ORDER BY t.updated_at DESC`,
      [tenantId, agentId],
    );

    res.json({
      success: true,
      data: tickets.rows.map((row) => ({
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
      })),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

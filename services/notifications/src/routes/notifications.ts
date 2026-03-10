import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '@flowdesk/database';
import { authenticate } from '../middleware/auth.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors.js';

export const notificationsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().max(100).default(25),
  isRead: z.string().optional(),
});

// ─── GET /notifications ───────────────────────────────────────────────────────

notificationsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query params', parsed.error.flatten());

    const { page, pageSize, isRead } = parsed.data;
    const { userId, tenantId } = req.auth;

    const conditions: string[] = ['user_id = $1', 'tenant_id = $2'];
    const params: unknown[] = [userId, tenantId];
    let paramIndex = 3;

    if (isRead !== undefined) {
      conditions.push(`is_read = $${paramIndex++}`);
      params.push(isRead === 'true');
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE ${where}`,
      params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const notifications = await query<Record<string, unknown>>(
      `SELECT id, user_id, tenant_id, type, title, body, is_read, entity_type, entity_id, created_at
       FROM notifications
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pageSize, offset],
    );

    res.json({
      success: true,
      data: {
        notifications: notifications.rows.map(mapNotification),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────

notificationsRouter.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const { userId, tenantId } = req.auth;
    const { id } = req.params;

    const notification = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM notifications WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    if (!notification) throw new NotFoundError('Notification');
    if (notification.user_id !== userId) throw new ForbiddenError();

    await query(
      `UPDATE notifications SET is_read = true WHERE id = $1`,
      [id],
    );

    res.json({
      success: true,
      data: { id, isRead: true },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /notifications/read-all ───────────────────────────────────────────

notificationsRouter.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const { userId, tenantId } = req.auth;

    const result = await query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND tenant_id = $2 AND is_read = false`,
      [userId, tenantId],
    );

    res.json({
      success: true,
      data: { updated: result.rowCount ?? 0 },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /notifications/unread-count ─────────────────────────────────────────

notificationsRouter.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const { userId, tenantId } = req.auth;

    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND tenant_id = $2 AND is_read = false`,
      [userId, tenantId],
    );

    res.json({
      success: true,
      data: { count: parseInt(result?.count ?? '0', 10) },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapNotification(row: Record<string, unknown>) {
  return {
    id: row['id'],
    userId: row['user_id'],
    tenantId: row['tenant_id'],
    type: row['type'],
    title: row['title'],
    body: row['body'],
    isRead: row['is_read'],
    entityType: row['entity_type'] ?? null,
    entityId: row['entity_id'] ?? null,
    createdAt: row['created_at'],
  };
}

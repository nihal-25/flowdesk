import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '@flowdesk/database';
import { publishEvent } from '@flowdesk/kafka';
import { generateSecureToken, hashToken, KAFKA_TOPICS } from '@flowdesk/shared';
import type { WebhookDeliverEvent } from '@flowdesk/shared';
import { authenticate } from '../middleware/auth.js';
import { ValidationError, NotFoundError } from '../errors.js';

export const webhooksRouter = Router();

// Only the events the platform actually emits today (each maps to a Kafka topic
// the tickets service publishes). Kept in sync with dispatchWebhooks call sites.
const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.resolved',
  'message.sent',
] as const;

const createSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const updateSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

function mapEndpoint(row: Record<string, unknown>) {
  return {
    id: row['id'],
    tenantId: row['tenant_id'],
    url: row['url'],
    events: row['events'] ?? [],
    secretPrefix: row['secret_prefix'],
    isActive: row['is_active'],
    consecutiveFailures: parseInt(String(row['consecutive_failures'] ?? '0'), 10),
    lastTriggeredAt: row['last_triggered_at'] ?? null,
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

// ─── POST /webhooks ───────────────────────────────────────────────────────────
// Creates an endpoint and returns the signing secret ONCE (never retrievable again).

webhooksRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid webhook data', parsed.error.flatten());

    const { url, events } = parsed.data;
    const { tenantId } = req.auth;

    // whsec_ prefix mirrors the Stripe/GitHub convention; secret is stored so the
    // notifications worker can sign each delivery (HMAC needs the original secret).
    const secret = `whsec_${generateSecureToken(24)}`;
    const secretHash = hashToken(secret);
    const secretPrefix = `${secret.slice(0, 14)}...`;

    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO webhook_endpoints (tenant_id, url, events, secret, secret_hash, secret_prefix)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, url, events, secret_prefix, is_active, consecutive_failures, last_triggered_at, created_at, updated_at`,
      [tenantId, url, events, secret, secretHash, secretPrefix],
    );

    res.status(201).json({
      success: true,
      data: { ...mapEndpoint(row ?? {}), secret }, // secret shown once
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /webhooks ────────────────────────────────────────────────────────────

webhooksRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const rows = await query<Record<string, unknown>>(
      `SELECT id, tenant_id, url, events, secret_prefix, is_active, consecutive_failures, last_triggered_at, created_at, updated_at
       FROM webhook_endpoints
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );

    res.json({
      success: true,
      data: rows.rows.map(mapEndpoint),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /webhooks/:id ──────────────────────────────────────────────────────

webhooksRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid update data', parsed.error.flatten());

    const { tenantId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Webhook endpoint'));

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!existing) throw new NotFoundError('Webhook endpoint');

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let i = 1;

    if (parsed.data.url !== undefined) { setClauses.push(`url = $${i++}`); params.push(parsed.data.url); }
    if (parsed.data.events !== undefined) { setClauses.push(`events = $${i++}`); params.push(parsed.data.events); }
    if (parsed.data.isActive !== undefined) {
      setClauses.push(`is_active = $${i++}`);
      params.push(parsed.data.isActive);
      // Re-enabling clears the failure counter so delivery resumes cleanly.
      if (parsed.data.isActive) setClauses.push('consecutive_failures = 0');
    }

    params.push(id, tenantId);
    const row = await queryOne<Record<string, unknown>>(
      `UPDATE webhook_endpoints SET ${setClauses.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i++}
       RETURNING id, tenant_id, url, events, secret_prefix, is_active, consecutive_failures, last_triggered_at, created_at, updated_at`,
      params,
    );

    res.json({
      success: true,
      data: mapEndpoint(row ?? {}),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /webhooks/:id ─────────────────────────────────────────────────────

webhooksRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Webhook endpoint'));

    const result = await query(
      `DELETE FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId],
    );
    if ((result.rowCount ?? 0) === 0) throw new NotFoundError('Webhook endpoint');

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

// ─── POST /webhooks/:id/test ──────────────────────────────────────────────────
// Enqueues a signed test delivery so the user can confirm their endpoint works.

webhooksRouter.post('/:id/test', authenticate, async (req, res, next) => {
  try {
    const { tenantId, requestId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Webhook endpoint'));

    const endpoint = await queryOne<{ id: string }>(
      `SELECT id FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!endpoint) throw new NotFoundError('Webhook endpoint');

    const event: WebhookDeliverEvent = {
      topic: KAFKA_TOPICS.WEBHOOK_DELIVER,
      tenantId,
      webhookEndpointId: id,
      eventType: 'webhook.test',
      payload: {
        event: 'webhook.test',
        tenantId,
        data: { message: 'This is a test webhook delivery from FlowDesk.' },
        timestamp: new Date().toISOString(),
      },
      attemptNumber: 1,
      requestId: requestId ?? req.id,
      timestamp: new Date().toISOString(),
    };
    await publishEvent(KAFKA_TOPICS.WEBHOOK_DELIVER, event, uuidv4());

    res.status(202).json({
      success: true,
      data: { enqueued: true },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /webhooks/:id/deliveries ─────────────────────────────────────────────

webhooksRouter.get('/:id/deliveries', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = req.auth;
    const id = req.params['id'];
    if (!id) return next(new NotFoundError('Webhook endpoint'));

    const endpoint = await queryOne<{ id: string }>(
      `SELECT id FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!endpoint) throw new NotFoundError('Webhook endpoint');

    const deliveries = await query<Record<string, unknown>>(
      `SELECT id, event_type, status, response_code, attempt_number, next_retry_at, created_at
       FROM webhook_deliveries
       WHERE webhook_endpoint_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id],
    );

    res.json({
      success: true,
      data: deliveries.rows.map((d) => ({
        id: d['id'],
        eventType: d['event_type'],
        status: d['status'],
        responseCode: d['response_code'] ?? null,
        attemptNumber: d['attempt_number'],
        nextRetryAt: d['next_retry_at'] ?? null,
        createdAt: d['created_at'],
      })),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

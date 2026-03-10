import type { Request, Response, NextFunction } from 'express';
import { publishEvent } from '@flowdesk/kafka';
import { KAFKA_TOPICS } from '@flowdesk/shared';
import type { AuditAction, AuditEntityType } from '@flowdesk/shared';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Middleware: publishes an audit log event to Kafka for every mutating request.
 * Non-blocking — fires and forgets so it doesn't slow down the response.
 */
export function auditMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method) || !req.auth) {
    return next();
  }

  const { action, entityType, entityId } = inferAuditContext(req);

  if (action && entityType) {
    publishEvent(KAFKA_TOPICS.AUDIT_LOG, {
      topic: KAFKA_TOPICS.AUDIT_LOG,
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      action,
      entityType,
      entityId: entityId ?? 'unknown',
      oldValue: null,
      newValue: null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    }).catch((err: unknown) => {
      console.error('[gateway:audit] Failed to publish audit log:', err);
    });
  }

  next();
}

function inferAuditContext(req: Request): {
  action: AuditAction | null;
  entityType: AuditEntityType | null;
  entityId: string | null;
} {
  const path = req.path.toLowerCase();
  const method = req.method;
  const id = req.params['id'] ?? null;

  if (path.includes('/tickets')) {
    const entityType: AuditEntityType = 'ticket';
    let action: AuditAction | null = null;
    if (method === 'POST') action = 'ticket.created';
    else if (method === 'PATCH') action = 'ticket.updated';
    else if (method === 'DELETE') action = 'ticket.deleted';
    return { action, entityType, entityId: id };
  }

  if (path.includes('/messages')) {
    return { action: 'message.created', entityType: 'message', entityId: id };
  }

  if (path.includes('/api-keys')) {
    const entityType: AuditEntityType = 'api_key';
    let action: AuditAction | null = null;
    if (method === 'POST') action = 'api_key.created';
    else if (method === 'DELETE') action = 'api_key.revoked';
    return { action, entityType, entityId: id };
  }

  if (path.includes('/webhooks')) {
    const entityType: AuditEntityType = 'webhook';
    let action: AuditAction | null = null;
    if (method === 'POST') action = 'webhook.created';
    else if (method === 'PATCH') action = 'webhook.updated';
    else if (method === 'DELETE') action = 'webhook.deleted';
    return { action, entityType, entityId: id };
  }

  return { action: null, entityType: null, entityId: null };
}

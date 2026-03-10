export type AuditAction =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.login'
  | 'user.logout'
  | 'user.password_changed'
  | 'user.role_changed'
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.deleted'
  | 'ticket.assigned'
  | 'ticket.status_changed'
  | 'message.created'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'webhook.updated';

export type AuditEntityType = 'user' | 'ticket' | 'message' | 'api_key' | 'webhook' | 'tenant';

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  tenantId: string;
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

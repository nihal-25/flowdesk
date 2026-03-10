import type { TicketPriority, TicketStatus } from './ticket.js';
import type { WebhookEvent } from './api-key.js';
import type { AuditAction, AuditEntityType } from './audit.js';
import type { NotificationType, NotificationEntityType } from './notification.js';

// ─── Topic Names ─────────────────────────────────────────────────────────────

export const KAFKA_TOPICS = {
  TICKET_CREATED: 'ticket.created',
  TICKET_UPDATED: 'ticket.updated',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_RESOLVED: 'ticket.resolved',
  MESSAGE_SENT: 'message.sent',
  NOTIFICATION_SEND: 'notification.send',
  WEBHOOK_DELIVER: 'webhook.deliver',
  AUDIT_LOG: 'audit.log',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

// ─── Event Payloads ───────────────────────────────────────────────────────────

export interface TicketCreatedEvent {
  topic: typeof KAFKA_TOPICS.TICKET_CREATED;
  tenantId: string;
  ticketId: string;
  title: string;
  priority: TicketPriority;
  customerId: string | null;
  createdByUserId: string;
  assignedTo: string | null;
  requestId: string;
  timestamp: string;
}

export interface TicketUpdatedEvent {
  topic: typeof KAFKA_TOPICS.TICKET_UPDATED;
  tenantId: string;
  ticketId: string;
  updatedByUserId: string;
  changes: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[];
  requestId: string;
  timestamp: string;
}

export interface TicketAssignedEvent {
  topic: typeof KAFKA_TOPICS.TICKET_ASSIGNED;
  tenantId: string;
  ticketId: string;
  title: string;
  assignedToUserId: string;
  assignedByUserId: string;
  previousAssigneeId: string | null;
  requestId: string;
  timestamp: string;
}

export interface TicketResolvedEvent {
  topic: typeof KAFKA_TOPICS.TICKET_RESOLVED;
  tenantId: string;
  ticketId: string;
  title: string;
  resolvedByUserId: string;
  customerId: string | null;
  resolutionTimeMs: number;
  requestId: string;
  timestamp: string;
}

export interface MessageSentEvent {
  topic: typeof KAFKA_TOPICS.MESSAGE_SENT;
  tenantId: string;
  ticketId: string;
  messageId: string;
  senderId: string;
  messageType: string;
  requestId: string;
  timestamp: string;
}

export interface NotificationSendEvent {
  topic: typeof KAFKA_TOPICS.NOTIFICATION_SEND;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  sendEmail: boolean;
  emailTo?: string;
  emailSubject?: string;
  requestId: string;
  timestamp: string;
}

export interface WebhookDeliverEvent {
  topic: typeof KAFKA_TOPICS.WEBHOOK_DELIVER;
  tenantId: string;
  webhookEndpointId: string;
  eventType: WebhookEvent;
  payload: Record<string, unknown>;
  attemptNumber: number;
  requestId: string;
  timestamp: string;
}

export interface AuditLogEvent {
  topic: typeof KAFKA_TOPICS.AUDIT_LOG;
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
  timestamp: string;
}

export type KafkaEventPayload =
  | TicketCreatedEvent
  | TicketUpdatedEvent
  | TicketAssignedEvent
  | TicketResolvedEvent
  | MessageSentEvent
  | NotificationSendEvent
  | WebhookDeliverEvent
  | AuditLogEvent;

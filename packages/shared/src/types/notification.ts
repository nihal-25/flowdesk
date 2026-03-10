export type NotificationType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_resolved'
  | 'ticket_updated'
  | 'message_received'
  | 'agent_invited'
  | 'system';

export type NotificationEntityType = 'ticket' | 'message' | 'user' | 'system';

export interface Notification {
  id: string;
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  createdAt: Date;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  type: NotificationType;
  inApp: boolean;
  email: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: NotificationEntityType;
  entityId?: string;
}

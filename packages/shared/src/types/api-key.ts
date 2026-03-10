export interface ApiKey {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  keyPrefix: string; // First 8 chars for display (e.g., "fd_live_ab...")
  lastUsedAt: Date | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyWithRaw extends ApiKey {
  rawKey: string; // Only returned once on creation
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: Date;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEvent[];
  secret: string; // Stored encrypted, shown once
  isActive: boolean;
  consecutiveFailures: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEvent =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.assigned'
  | 'ticket.resolved'
  | 'ticket.closed'
  | 'message.sent';

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  eventType: WebhookEvent;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  responseCode: number | null;
  responseBody: string | null;
  attemptNumber: number;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export interface CreateWebhookEndpointInput {
  url: string;
  events: WebhookEvent[];
}

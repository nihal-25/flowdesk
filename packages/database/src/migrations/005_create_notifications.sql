-- Migration: 005_create_notifications

CREATE TYPE notification_type AS ENUM (
  'ticket_created', 'ticket_assigned', 'ticket_resolved',
  'ticket_updated', 'message_received', 'agent_invited', 'system'
);

CREATE TYPE notification_entity_type AS ENUM ('ticket', 'message', 'user', 'system');

CREATE TABLE notifications (
  id          UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID                     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id   UUID                     NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  type        notification_type        NOT NULL,
  title       VARCHAR(255)             NOT NULL,
  body        TEXT                     NOT NULL,
  is_read     BOOLEAN                  NOT NULL DEFAULT FALSE,
  entity_type notification_entity_type,
  entity_id   UUID,
  created_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id   ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_tenant_id ON notifications (tenant_id);
CREATE INDEX idx_notifications_is_read   ON notifications (user_id, is_read) WHERE NOT is_read;

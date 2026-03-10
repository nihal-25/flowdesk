-- Migration: 004_create_tickets

CREATE TYPE ticket_status   AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE ticket_event_type AS ENUM (
  'created', 'status_changed', 'priority_changed',
  'assigned', 'unassigned', 'tag_added', 'tag_removed',
  'message_added', 'closed', 'reopened'
);
CREATE TYPE message_type AS ENUM ('text', 'system', 'file', 'note');

CREATE TABLE tickets (
  id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  customer_id UUID            REFERENCES users (id) ON DELETE SET NULL,
  assigned_to UUID            REFERENCES users (id) ON DELETE SET NULL,
  title       VARCHAR(500)    NOT NULL,
  description TEXT            NOT NULL DEFAULT '',
  status      ticket_status   NOT NULL DEFAULT 'open',
  priority    ticket_priority NOT NULL DEFAULT 'medium',
  tags        TEXT[]          NOT NULL DEFAULT '{}',
  is_deleted  BOOLEAN         NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_tenant_id    ON tickets (tenant_id);
CREATE INDEX idx_tickets_status       ON tickets (tenant_id, status) WHERE NOT is_deleted;
CREATE INDEX idx_tickets_priority     ON tickets (tenant_id, priority) WHERE NOT is_deleted;
CREATE INDEX idx_tickets_assigned_to  ON tickets (assigned_to) WHERE NOT is_deleted;
CREATE INDEX idx_tickets_customer_id  ON tickets (customer_id);
CREATE INDEX idx_tickets_created_at   ON tickets (tenant_id, created_at DESC);
CREATE INDEX idx_tickets_updated_at   ON tickets (tenant_id, updated_at DESC);
CREATE INDEX idx_tickets_tags         ON tickets USING GIN (tags);

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE messages (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID         NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  sender_id    UUID         REFERENCES users (id) ON DELETE SET NULL,
  body         TEXT         NOT NULL,
  message_type message_type NOT NULL DEFAULT 'text',
  is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
  attachments  JSONB        NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_ticket_id  ON messages (ticket_id, created_at ASC);
CREATE INDEX idx_messages_sender_id  ON messages (sender_id);
CREATE INDEX idx_messages_is_read    ON messages (ticket_id, is_read) WHERE NOT is_read;

-- ─── Ticket Events (audit trail) ─────────────────────────────────────────────

CREATE TABLE ticket_events (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID              NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  user_id     UUID              REFERENCES users (id) ON DELETE SET NULL,
  event_type  ticket_event_type NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_events_ticket_id  ON ticket_events (ticket_id, created_at ASC);
CREATE INDEX idx_ticket_events_user_id    ON ticket_events (user_id);

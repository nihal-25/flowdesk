-- Migration: 007_create_audit_logs

CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users (id) ON DELETE SET NULL,
  action      VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id   UUID        NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  user_agent  TEXT,
  request_id  VARCHAR(36),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id   ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_id     ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity      ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_action      ON audit_logs (tenant_id, action);

-- ─── Presence ─────────────────────────────────────────────────────────────────

CREATE TYPE presence_status AS ENUM ('online', 'away', 'offline');

CREATE TABLE presence (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID            NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  tenant_id    UUID            NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  status       presence_status NOT NULL DEFAULT 'offline',
  last_seen_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_presence_tenant_id ON presence (tenant_id, status);
CREATE INDEX idx_presence_user_id   ON presence (user_id);

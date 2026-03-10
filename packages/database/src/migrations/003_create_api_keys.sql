-- Migration: 003_create_api_keys

CREATE TABLE api_keys (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  key_hash     VARCHAR(64)  NOT NULL UNIQUE, -- SHA-256 of the raw key
  key_prefix   VARCHAR(20)  NOT NULL,        -- First chars for display (e.g. fd_live_ab12...)
  last_used_at TIMESTAMPTZ,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant_id ON api_keys (tenant_id);
CREATE INDEX idx_api_keys_key_hash  ON api_keys (key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys (tenant_id, is_active);

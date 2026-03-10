-- Migration: 002_create_users
-- Creates users and refresh_tokens tables

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'agent', 'viewer');

CREATE TABLE users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  role            user_role    NOT NULL DEFAULT 'agent',
  hashed_password VARCHAR(255) NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  avatar_url      TEXT,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Email is unique per tenant (not globally)
  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id  ON users (tenant_id);
CREATE INDEX idx_users_email      ON users (email);
CREATE INDEX idx_users_role       ON users (tenant_id, role);
CREATE INDEX idx_users_is_active  ON users (tenant_id, is_active);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Refresh Tokens ────────────────────────────────────────────────────────────
-- Stored as hashes; the raw token is never persisted

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
  family_id   UUID        NOT NULL,        -- Token family for rotation detection
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_family_id  ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- ─── Invite Tokens ────────────────────────────────────────────────────────────

CREATE TABLE invite_tokens (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email      VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  role       user_role    NOT NULL DEFAULT 'agent',
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  invited_by UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invite_tokens_token_hash ON invite_tokens (token_hash);
CREATE INDEX idx_invite_tokens_email      ON invite_tokens (tenant_id, email);

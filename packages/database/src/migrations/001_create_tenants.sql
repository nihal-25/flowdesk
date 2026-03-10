-- Migration: 001_create_tenants
-- Creates the tenants table (root of all multi-tenant data isolation)

CREATE TYPE tenant_plan AS ENUM ('free', 'starter', 'growth', 'enterprise');

CREATE TABLE tenants (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(100) NOT NULL UNIQUE,
  plan                  tenant_plan  NOT NULL DEFAULT 'free',
  max_agents            INT          NOT NULL DEFAULT 3,
  max_tickets_per_month INT          NOT NULL DEFAULT 100,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_is_active ON tenants (is_active);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

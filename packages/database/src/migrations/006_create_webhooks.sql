-- Migration: 006_create_webhooks

CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');

CREATE TABLE webhook_endpoints (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  url                  TEXT        NOT NULL,
  events               TEXT[]      NOT NULL DEFAULT '{}',
  secret_hash          VARCHAR(64) NOT NULL, -- SHA-256 of the signing secret
  secret_prefix        VARCHAR(20) NOT NULL, -- First chars for display
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  consecutive_failures INT         NOT NULL DEFAULT 0,
  last_triggered_at    TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_tenant_id ON webhook_endpoints (tenant_id);
CREATE INDEX idx_webhook_endpoints_events    ON webhook_endpoints USING GIN (events);

CREATE TRIGGER webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Webhook Deliveries ───────────────────────────────────────────────────────

CREATE TABLE webhook_deliveries (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id UUID                    NOT NULL REFERENCES webhook_endpoints (id) ON DELETE CASCADE,
  event_type          TEXT                    NOT NULL,
  payload             JSONB                   NOT NULL,
  status              webhook_delivery_status NOT NULL DEFAULT 'pending',
  response_code       INT,
  response_body       TEXT,
  attempt_number      INT                     NOT NULL DEFAULT 1,
  next_retry_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint_id ON webhook_deliveries (webhook_endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_status      ON webhook_deliveries (status) WHERE status IN ('pending', 'retrying');

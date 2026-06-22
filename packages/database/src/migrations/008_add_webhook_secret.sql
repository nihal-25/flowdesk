-- Migration: 008_add_webhook_secret
--
-- Webhook signing secrets must be stored retrievably so the notifications
-- service can compute the HMAC-SHA256 signature for every outgoing delivery
-- (HMAC requires the original secret on both ends — unlike API keys, a one-way
-- hash is insufficient because the server itself signs each payload). The raw
-- secret is shown to the user once at creation; afterwards only `secret_prefix`
-- is surfaced via the API. `secret_hash` is retained for reference/lookup.

ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret TEXT NOT NULL DEFAULT '';

-- secret_hash was originally NOT NULL; keep it populated but it is no longer the
-- source of truth for signing.
ALTER TABLE webhook_endpoints ALTER COLUMN secret_hash DROP NOT NULL;

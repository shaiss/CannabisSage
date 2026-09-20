-- CannabisSage durable licenses (Neon / Postgres)
-- Applied automatically on first DB access via CREATE TABLE IF NOT EXISTS,
-- or run manually against DATABASE_URL.

CREATE TABLE IF NOT EXISTS licenses (
  license_key TEXT PRIMARY KEY,
  email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active', 'past_due', 'canceled', 'inactive')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS licenses_stripe_subscription_id_uidx
  ON licenses (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS licenses_stripe_customer_id_idx
  ON licenses (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS licenses_status_idx
  ON licenses (status);

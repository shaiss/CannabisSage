import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

/** Prefer DATABASE_URL; accept POSTGRES_URL (Vercel/Neon Marketplace alias). */
export function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  return url.trim() || null;
}

export function hasDatabaseUrl(): boolean {
  return databaseUrl() !== null;
}

/**
 * Dev-only file/.data fallback when ALLOW_DEV_MOCK=1 and no DATABASE_URL.
 * Production (no mock flag) fails closed without a DB URL.
 */
export function allowDevFileStore(): boolean {
  return process.env.ALLOW_DEV_MOCK === '1' && !hasDatabaseUrl();
}

export function getSql(): NeonQueryFunction<false, false> {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL (or POSTGRES_URL) is required for durable licenses. ' +
        'Set ALLOW_DEV_MOCK=1 only for local file-store development.'
    );
  }
  if (!sql) {
    sql = neon(url);
  }
  return sql;
}

/** Idempotent bootstrap matching web/db/migrations/001_licenses.sql */
export async function ensureLicenseSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getSql();
      await db`
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
        )
      `;
      await db`
        CREATE UNIQUE INDEX IF NOT EXISTS licenses_stripe_subscription_id_uidx
          ON licenses (stripe_subscription_id)
          WHERE stripe_subscription_id IS NOT NULL
      `;
      await db`
        CREATE INDEX IF NOT EXISTS licenses_stripe_customer_id_idx
          ON licenses (stripe_customer_id)
          WHERE stripe_customer_id IS NOT NULL
      `;
      await db`
        CREATE INDEX IF NOT EXISTS licenses_status_idx
          ON licenses (status)
      `;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

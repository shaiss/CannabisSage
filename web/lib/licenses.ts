import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { allowDevFileStore, ensureLicenseSchema, getSql, hasDatabaseUrl } from './db';

export type LicenseRecord = {
  licenseKey: string;
  status: 'active' | 'past_due' | 'canceled' | 'inactive';
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

type LicenseRow = {
  license_key: string;
  status: LicenseRecord['status'];
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function dataDir(): string {
  return process.env.LICENSE_DATA_DIR || path.join(process.cwd(), '.data');
}

function storePath(): string {
  return path.join(dataDir(), 'licenses.json');
}

function readAllFile(): Record<string, LicenseRecord> {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, LicenseRecord>;
  } catch {
    return {};
  }
}

function writeAllFile(map: Record<string, LicenseRecord>): void {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(map, null, 2));
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function rowToRecord(row: LicenseRow): LicenseRecord {
  return {
    licenseKey: row.license_key,
    status: row.status,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodEnd: toIso(row.current_period_end),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString()
  };
}

/** CSG-XXXX-XXXX-XXXX (uppercase alphanumeric). */
export function generateLicenseKey(): string {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return `CSG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function assertStoreAvailable(): void {
  if (hasDatabaseUrl()) return;
  if (allowDevFileStore()) return;
  throw new Error(
    'License store unavailable: set DATABASE_URL (Neon) for production, ' +
      'or ALLOW_DEV_MOCK=1 for local .data file fallback only.'
  );
}

async function upsertLicenseDb(
  partial: Omit<LicenseRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<LicenseRecord> {
  await ensureLicenseSchema();
  const db = getSql();
  const now = new Date().toISOString();
  const licenseKey = partial.licenseKey.trim().toUpperCase();
  const rows = (await db`
    INSERT INTO licenses (
      license_key,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      current_period_end,
      created_at,
      updated_at
    ) VALUES (
      ${licenseKey},
      ${partial.email},
      ${partial.stripeCustomerId},
      ${partial.stripeSubscriptionId},
      ${partial.status},
      ${partial.currentPeriodEnd},
      ${partial.createdAt || now},
      ${now}
    )
    ON CONFLICT (license_key) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, licenses.email),
      stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, licenses.stripe_customer_id),
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, licenses.stripe_subscription_id),
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = EXCLUDED.updated_at
    RETURNING
      license_key,
      status,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      created_at,
      updated_at
  `) as LicenseRow[];
  return rowToRecord(rows[0]);
}

function upsertLicenseFile(
  partial: Omit<LicenseRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): LicenseRecord {
  const all = readAllFile();
  const existing = all[partial.licenseKey];
  const now = new Date().toISOString();
  const record: LicenseRecord = {
    licenseKey: partial.licenseKey,
    status: partial.status,
    email: partial.email,
    stripeCustomerId: partial.stripeCustomerId,
    stripeSubscriptionId: partial.stripeSubscriptionId,
    currentPeriodEnd: partial.currentPeriodEnd,
    createdAt: existing?.createdAt || partial.createdAt || now,
    updatedAt: now
  };
  all[record.licenseKey] = record;
  writeAllFile(all);
  return record;
}

/** Sole license upsert used by webhook / activate / validate / fulfillment. */
export async function upsertLicense(
  partial: Omit<LicenseRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string }
): Promise<LicenseRecord> {
  assertStoreAvailable();
  const licenseKey = String(partial.licenseKey || '').trim().toUpperCase();
  const payload = { ...partial, licenseKey };
  if (hasDatabaseUrl()) {
    return upsertLicenseDb(payload);
  }
  return upsertLicenseFile(payload);
}

async function getLicenseDb(licenseKey: string): Promise<LicenseRecord | null> {
  await ensureLicenseSchema();
  const db = getSql();
  const rows = (await db`
    SELECT
      license_key,
      status,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      created_at,
      updated_at
    FROM licenses
    WHERE license_key = ${licenseKey}
    LIMIT 1
  `) as LicenseRow[];
  return rows[0] ? rowToRecord(rows[0]) : null;
}

function getLicenseFile(licenseKey: string): LicenseRecord | null {
  const all = readAllFile();
  return all[licenseKey] || null;
}

export async function getLicense(licenseKey: string): Promise<LicenseRecord | null> {
  assertStoreAvailable();
  const key = String(licenseKey || '').trim().toUpperCase();
  if (!key) return null;
  if (hasDatabaseUrl()) {
    return getLicenseDb(key);
  }
  return getLicenseFile(key);
}

async function findBySubscriptionIdDb(subscriptionId: string): Promise<LicenseRecord | null> {
  await ensureLicenseSchema();
  const db = getSql();
  const rows = (await db`
    SELECT
      license_key,
      status,
      email,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_end,
      created_at,
      updated_at
    FROM licenses
    WHERE stripe_subscription_id = ${subscriptionId}
    LIMIT 1
  `) as LicenseRow[];
  return rows[0] ? rowToRecord(rows[0]) : null;
}

function findBySubscriptionIdFile(subscriptionId: string): LicenseRecord | null {
  const all = readAllFile();
  return Object.values(all).find((r) => r.stripeSubscriptionId === subscriptionId) || null;
}

export async function findBySubscriptionId(subscriptionId: string): Promise<LicenseRecord | null> {
  assertStoreAvailable();
  const id = String(subscriptionId || '').trim();
  if (!id) return null;
  if (hasDatabaseUrl()) {
    return findBySubscriptionIdDb(id);
  }
  return findBySubscriptionIdFile(id);
}

export function isEntitlementActive(record: LicenseRecord | null, now = new Date()): boolean {
  if (!record) return false;
  if (record.status !== 'active' && record.status !== 'past_due') return false;
  if (record.currentPeriodEnd) {
    const end = new Date(record.currentPeriodEnd).getTime();
    if (!Number.isNaN(end) && end < now.getTime()) return false;
  }
  return true;
}

export type EntitlementResponse = {
  ok: boolean;
  active: boolean;
  licenseKey?: string;
  status?: string;
  email?: string | null;
  expiresAt?: string | null;
  plan?: string;
  error?: string;
};

export function toEntitlementResponse(record: LicenseRecord | null): EntitlementResponse {
  if (!record) {
    return { ok: false, active: false, error: 'License not found' };
  }
  const active = isEntitlementActive(record);
  return {
    ok: true,
    active,
    licenseKey: record.licenseKey,
    status: record.status,
    email: record.email,
    expiresAt: record.currentPeriodEnd,
    plan: 'pro'
  };
}

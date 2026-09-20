import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

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

function dataDir(): string {
  return process.env.LICENSE_DATA_DIR || path.join(process.cwd(), '.data');
}

function storePath(): string {
  return path.join(dataDir(), 'licenses.json');
}

function readAll(): Record<string, LicenseRecord> {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, LicenseRecord>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, LicenseRecord>): void {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(map, null, 2));
}

/** CSG-XXXX-XXXX-XXXX (uppercase alphanumeric). */
export function generateLicenseKey(): string {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return `CSG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function upsertLicense( partial: Omit<LicenseRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string }): LicenseRecord {
  const all = readAll();
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
  writeAll(all);
  return record;
}

export function getLicense(licenseKey: string): LicenseRecord | null {
  const key = String(licenseKey || '').trim().toUpperCase();
  const all = readAll();
  return all[key] || null;
}

export function findBySubscriptionId(subscriptionId: string): LicenseRecord | null {
  const all = readAll();
  return Object.values(all).find((r) => r.stripeSubscriptionId === subscriptionId) || null;
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

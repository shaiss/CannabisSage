/**
 * Partner registry (HTTPS JSON) — same host-normalization rules as the denylist.
 * Landing Supported list renders only from this file, never from adapter display names.
 */

import partnersDoc from '@/public/partners.json';
import denylistDoc from '@/public/denylist.json';

export const PARTNER_STATUSES = ['verified', 'community', 'denied'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export type PartnerRecord = {
  host: string;
  status: PartnerStatus;
  displayName: string;
  notes?: string;
};

export type PartnersDocument = {
  version: number;
  updatedAt: string | null;
  partners: PartnerRecord[];
};

/** Strip www. the same way extension/background.js normalizeHost does. */
export function normalizeHost(host: string | null | undefined): string {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

export function isValidHostname(host: string): boolean {
  if (!host || /[/:?#\s*]/.test(host) || host.includes('..')) return false;
  return /^[a-z0-9.-]+$/.test(host);
}

export function parseDenylistHosts(data: unknown): string[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const hosts = (data as { hosts?: unknown }).hosts;
  if (!Array.isArray(hosts)) return [];
  const out: string[] = [];
  for (const entry of hosts) {
    if (typeof entry !== 'string') continue;
    const h = normalizeHost(entry);
    if (!isValidHostname(h)) continue;
    out.push(h);
  }
  return [...new Set(out)];
}

export function parsePartnersDocument(data: unknown): PartnersDocument | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const doc = data as Record<string, unknown>;
  if (!Array.isArray(doc.partners)) return null;
  const partners: PartnerRecord[] = [];
  const seen = new Set<string>();
  for (const entry of doc.partners) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const host = normalizeHost(typeof row.host === 'string' ? row.host : '');
    if (!isValidHostname(host) || seen.has(host)) continue;
    if (typeof row.displayName !== 'string') continue;
    const displayName = row.displayName.trim();
    if (!displayName) continue;
    if (typeof row.status !== 'string') continue;
    if (!PARTNER_STATUSES.includes(row.status as PartnerStatus)) continue;
    const record: PartnerRecord = {
      host,
      status: row.status as PartnerStatus,
      displayName
    };
    if (typeof row.notes === 'string' && row.notes.trim()) {
      record.notes = row.notes.trim();
    }
    seen.add(host);
    partners.push(record);
  }
  return {
    version: Number.isFinite(Number(doc.version)) ? Number(doc.version) : 1,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    partners
  };
}

/**
 * Denylist wins: a host on denylist.json is omitted even if the registry says
 * verified or community. Registry status `denied` is also omitted.
 */
export function listSupportedPartners(
  partnersDocInput: unknown,
  denylistDocInput: unknown
): PartnerRecord[] {
  const parsed = parsePartnersDocument(partnersDocInput);
  if (!parsed) return [];
  const denied = new Set(parseDenylistHosts(denylistDocInput));
  return parsed.partners.filter((p) => p.status !== 'denied' && !denied.has(p.host));
}

export function getVisibleSupportedPartners(): PartnerRecord[] {
  return listSupportedPartners(partnersDoc, denylistDoc);
}

/**
 * Partner registry helpers for smoke tests.
 * Host rules match extension/background.js normalizeHost + denylist parsing.
 */

export const PARTNER_STATUSES = ['verified', 'community', 'denied'];

export function normalizeHost(host) {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

export function isValidHostname(host) {
  if (!host || /[/:?#\s*]/.test(host) || host.includes('..')) return false;
  return /^[a-z0-9.-]+$/.test(host);
}

export function parseDenylistHosts(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  if (!Array.isArray(data.hosts)) return [];
  const out = [];
  for (const entry of data.hosts) {
    if (typeof entry !== 'string') continue;
    const h = normalizeHost(entry);
    if (!isValidHostname(h)) continue;
    out.push(h);
  }
  return [...new Set(out)];
}

export function parsePartnersDocument(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data.partners)) return null;
  const partners = [];
  const seen = new Set();
  for (const entry of data.partners) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const host = normalizeHost(entry.host);
    if (!isValidHostname(host) || seen.has(host)) continue;
    if (typeof entry.displayName !== 'string') continue;
    const displayName = entry.displayName.trim();
    if (!displayName) continue;
    if (typeof entry.status !== 'string') continue;
    if (!PARTNER_STATUSES.includes(entry.status)) continue;
    const record = { host, status: entry.status, displayName };
    if (typeof entry.notes === 'string' && entry.notes.trim()) {
      record.notes = entry.notes.trim();
    }
    seen.add(host);
    partners.push(record);
  }
  return {
    version: Number.isFinite(data.version) ? data.version : 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    partners
  };
}

export function listSupportedPartners(partnersDoc, denylistDoc) {
  const parsed = parsePartnersDocument(partnersDoc);
  if (!parsed) return [];
  const denied = new Set(parseDenylistHosts(denylistDoc));
  return parsed.partners.filter((p) => p.status !== 'denied' && !denied.has(p.host));
}

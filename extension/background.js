/**
 * CannabisSage service worker — product HTML fetch, cache pruning, remote denylist
 * and partner registry. Allowed PDP URLs are validated against known store
 * host/path rules (mirrors adapter isAllowedFetchUrl — kept inline because SW
 * has no DOM adapters). Denylist and partners are HTTPS JSON config only —
 * never remote code. Adapters stay in-package.
 */

const ALLOWED_FETCH_RULES = [
  {
    hosts: ['www.sunnyside.shop', 'sunnyside.shop'],
    path: /^\/product\/[^/]+\/?$/
  },
  {
    hosts: ['zenleafdispensaries.com', 'www.zenleafdispensaries.com'],
    path: /^\/locations\/[^/]+\/(?:(?:medical|recreational)-menu\/)?menu\/[^/]+\/[^/]+\/?$/i
  }
];

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DENYLIST_STORAGE_KEY = 'csi_denylist';
const PARTNERS_STORAGE_KEY = 'csi_partners';
const DENYLIST_TTL_MS = 15 * 60 * 1000; // refresh cadence
const DENYLIST_STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // LKG usable window
const PARTNERS_TTL_MS = DENYLIST_TTL_MS;
const PARTNERS_STALE_MAX_MS = DENYLIST_STALE_MAX_MS;
const DEFAULT_API_BASE = 'https://cannabissage.app';
const DEFAULT_DENYLIST_PATH = '/denylist.json';
const DEFAULT_PARTNERS_PATH = '/partners.json';
const PARTNER_STATUSES = ['verified', 'community', 'denied'];

let denylistInflight = null;
let partnersInflight = null;

function isAllowedProductUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_FETCH_RULES.some(
      (rule) => rule.hosts.includes(url.hostname) && rule.path.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function normalizeHost(host) {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function parseDenylistPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data.hosts)) return null;
  const hosts = [];
  for (const entry of data.hosts) {
    if (typeof entry !== 'string') continue;
    const h = normalizeHost(entry);
    // Hostnames only — reject paths, schemes, spaces, wildcards
    if (!h || /[/:?#\s*]/.test(h) || h.includes('..')) continue;
    if (!/^[a-z0-9.-]+$/.test(h)) continue;
    hosts.push(h);
  }
  return {
    version: Number.isFinite(data.version) ? data.version : 1,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    hosts: [...new Set(hosts)]
  };
}

function hostIsDenied(hostname, hosts) {
  const target = normalizeHost(hostname);
  if (!target || !Array.isArray(hosts) || !hosts.length) return false;
  return hosts.some((h) => h === target || normalizeHost(h) === target);
}

function isValidHostname(host) {
  if (!host || /[/:?#\s*]/.test(host) || host.includes('..')) return false;
  return /^[a-z0-9.-]+$/.test(host);
}

function parsePartnersPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Array.isArray(data.partners)) return null;
  const partners = [];
  const seen = new Set();
  for (const entry of data.partners) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const host = normalizeHost(typeof entry.host === 'string' ? entry.host : '');
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

function partnerChromeFromRecord(hostname, record) {
  if (!record || !Array.isArray(record.partners)) return null;
  const host = normalizeHost(hostname);
  if (!isValidHostname(host)) return null;
  const row = record.partners.find((p) => p.host === host);
  if (!row) return null;
  if (row.status !== 'verified' && row.status !== 'community') return null;
  if (!row.displayName) return null;
  return { host: row.host, status: row.status, displayName: row.displayName };
}

async function loadApiBase() {
  let apiBase = DEFAULT_API_BASE;
  let denylistPath = DEFAULT_DENYLIST_PATH;
  let partnersPath = DEFAULT_PARTNERS_PATH;
  try {
    const url = chrome.runtime.getURL('data/config.json');
    const res = await fetch(url);
    if (res.ok) {
      const cfg = await res.json();
      if (cfg?.apiBaseUrl) apiBase = String(cfg.apiBaseUrl);
      if (cfg?.denylistPath) denylistPath = String(cfg.denylistPath);
      if (cfg?.partnersPath) partnersPath = String(cfg.partnersPath);
    }
  } catch {
    /* use defaults */
  }
  try {
    const local = await chrome.storage.local.get(['csi_api_base']);
    if (local.csi_api_base) apiBase = String(local.csi_api_base);
  } catch {
    /* ignore */
  }
  apiBase = apiBase.replace(/\/$/, '');
  if (!denylistPath.startsWith('/')) denylistPath = `/${denylistPath}`;
  if (!partnersPath.startsWith('/')) partnersPath = `/${partnersPath}`;
  return { apiBase, denylistPath, partnersPath };
}

async function readDenylistCache() {
  try {
    const data = await chrome.storage.local.get([DENYLIST_STORAGE_KEY]);
    return data[DENYLIST_STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

async function writeDenylistCache(record) {
  try {
    await chrome.storage.local.set({ [DENYLIST_STORAGE_KEY]: record });
  } catch {
    /* ignore */
  }
}

async function fetchDenylistRemote() {
  const { apiBase, denylistPath } = await loadApiBase();
  const url = `${apiBase}${denylistPath}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-cache',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`denylist HTTP ${res.status}`);
  const raw = await res.json();
  const parsed = parseDenylistPayload(raw);
  if (!parsed) throw new Error('denylist invalid payload');
  return {
    ...parsed,
    fetchedAt: Date.now(),
    sourceUrl: url
  };
}

/**
 * Prefer fresh remote; on failure fail-open to last-known-good within STALE_MAX;
 * if no cache, empty hosts (allow enhancement).
 */
async function getDenylistRecord(forceRefresh = false) {
  const cached = await readDenylistCache();
  const now = Date.now();
  if (
    !forceRefresh &&
    cached?.fetchedAt &&
    now - cached.fetchedAt < DENYLIST_TTL_MS &&
    Array.isArray(cached.hosts)
  ) {
    return cached;
  }

  if (!denylistInflight) {
    denylistInflight = (async () => {
      try {
        const fresh = await fetchDenylistRemote();
        await writeDenylistCache(fresh);
        return fresh;
      } catch {
        if (cached && Array.isArray(cached.hosts) && cached.fetchedAt) {
          const age = now - cached.fetchedAt;
          if (age <= DENYLIST_STALE_MAX_MS) {
            return { ...cached, stale: true };
          }
        }
        // Fail-open: no usable cache → empty deny set
        return {
          version: 1,
          updatedAt: null,
          hosts: [],
          fetchedAt: cached?.fetchedAt || 0,
          failOpen: true
        };
      } finally {
        denylistInflight = null;
      }
    })();
  }
  return denylistInflight;
}

async function isHostDenied(hostname) {
  const record = await getDenylistRecord(false);
  return {
    denied: hostIsDenied(hostname, record.hosts || []),
    hosts: record.hosts || [],
    stale: !!record.stale,
    failOpen: !!record.failOpen,
    fetchedAt: record.fetchedAt || 0
  };
}

async function readPartnersCache() {
  try {
    const data = await chrome.storage.local.get([PARTNERS_STORAGE_KEY]);
    return data[PARTNERS_STORAGE_KEY] || null;
  } catch {
    return null;
  }
}

async function writePartnersCache(record) {
  try {
    await chrome.storage.local.set({ [PARTNERS_STORAGE_KEY]: record });
  } catch {
    /* ignore */
  }
}

async function fetchPartnersRemote() {
  const { apiBase, partnersPath } = await loadApiBase();
  const url = `${apiBase}${partnersPath}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-cache',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`partners HTTP ${res.status}`);
  const raw = await res.json();
  const parsed = parsePartnersPayload(raw);
  if (!parsed) throw new Error('partners invalid payload');
  return {
    ...parsed,
    fetchedAt: Date.now(),
    sourceUrl: url
  };
}

/**
 * Prefer fresh remote; on failure reuse last-known-good within STALE_MAX;
 * if no cache, empty partners (no in-page chrome — quiet miss).
 */
async function getPartnersRecord(forceRefresh = false) {
  const cached = await readPartnersCache();
  const now = Date.now();
  if (
    !forceRefresh &&
    cached?.fetchedAt &&
    now - cached.fetchedAt < PARTNERS_TTL_MS &&
    Array.isArray(cached.partners)
  ) {
    return cached;
  }

  if (!partnersInflight) {
    partnersInflight = (async () => {
      try {
        const fresh = await fetchPartnersRemote();
        await writePartnersCache(fresh);
        return fresh;
      } catch {
        if (cached && Array.isArray(cached.partners) && cached.fetchedAt) {
          const age = now - cached.fetchedAt;
          if (age <= PARTNERS_STALE_MAX_MS) {
            return { ...cached, stale: true };
          }
        }
        return {
          version: 1,
          updatedAt: null,
          partners: [],
          fetchedAt: cached?.fetchedAt || 0,
          failOpen: true
        };
      } finally {
        partnersInflight = null;
      }
    })();
  }
  return partnersInflight;
}

async function lookupPartnerChrome(hostname) {
  const deny = await isHostDenied(hostname);
  if (deny.denied) {
    return {
      chrome: null,
      denied: true,
      stale: !!deny.stale,
      failOpen: !!deny.failOpen,
      fetchedAt: deny.fetchedAt || 0
    };
  }
  const record = await getPartnersRecord(false);
  return {
    chrome: partnerChromeFromRecord(hostname, record),
    denied: false,
    stale: !!record.stale,
    failOpen: !!record.failOpen,
    fetchedAt: record.fetchedAt || 0
  };
}

async function pruneExpiredCache() {
  try {
    const all = await chrome.storage.local.get(null);
    const toRemove = [];
    Object.entries(all || {}).forEach(([k, v]) => {
      if (!k.startsWith('csi_pdp:')) return;
      if (!v || !v.fetchedAt || Date.now() - v.fetchedAt > CACHE_TTL_MS) toRemove.push(k);
    });
    if (toRemove.length) await chrome.storage.local.remove(toRemove);
  } catch {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  pruneExpiredCache();
  getDenylistRecord(true).catch(() => {});
  getPartnersRecord(true).catch(() => {});
});

chrome.runtime.onStartup?.addListener?.(() => {
  pruneExpiredCache();
  getDenylistRecord(true).catch(() => {});
  getPartnersRecord(true).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'CSI_DENYLIST_CHECK') {
    const host = message.host || '';
    (async () => {
      try {
        const result = await isHostDenied(host);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        // Fail-open
        sendResponse({
          ok: true,
          denied: false,
          failOpen: true,
          error: err && err.message ? err.message : 'denylist check failed'
        });
      }
    })();
    return true;
  }

  if (message.type === 'CSI_DENYLIST_REFRESH') {
    (async () => {
      try {
        const record = await getDenylistRecord(true);
        sendResponse({ ok: true, hosts: record.hosts || [], fetchedAt: record.fetchedAt });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : 'denylist refresh failed'
        });
      }
    })();
    return true;
  }

  if (message.type === 'CSI_PARTNERS_LOOKUP') {
    const host = message.host || '';
    (async () => {
      try {
        const result = await lookupPartnerChrome(host);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({
          ok: true,
          chrome: null,
          failOpen: true,
          error: err && err.message ? err.message : 'partners lookup failed'
        });
      }
    })();
    return true;
  }

  if (message.type === 'CSI_PARTNERS_REFRESH') {
    (async () => {
      try {
        const record = await getPartnersRecord(true);
        sendResponse({
          ok: true,
          partners: record.partners || [],
          fetchedAt: record.fetchedAt
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : 'partners refresh failed'
        });
      }
    })();
    return true;
  }

  if (message.type !== 'FETCH_PRODUCT_HTML') {
    return false;
  }

  const { url } = message;
  if (!isAllowedProductUrl(url)) {
    sendResponse({ ok: false, error: 'Blocked: URL is not an allowed product page.' });
    return false;
  }

  (async () => {
    try {
      let hostname = '';
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = '';
      }
      const deny = await isHostDenied(hostname);
      if (deny.denied) {
        sendResponse({ ok: false, error: 'Support for this store is paused.' });
        return;
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-cache',
        headers: {
          Accept: 'text/html,application/xhtml+xml'
        }
      });

      if (!response.ok) {
        sendResponse({
          ok: false,
          error: `Failed to fetch product details (${response.status})`
        });
        return;
      }

      const html = await response.text();
      sendResponse({ ok: true, html, finalUrl: response.url || url });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : 'Network error fetching product details'
      });
    }
  })();

  return true;
});

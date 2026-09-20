/**
 * CannabisSage service worker — product HTML fetch + cache pruning.
 * Allowed PDP URLs are validated against known store host/path rules
 * (mirrors adapter isAllowedFetchUrl — kept inline because SW has no DOM adapters).
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
});

chrome.runtime.onStartup?.addListener?.(() => {
  pruneExpiredCache();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'FETCH_PRODUCT_HTML') {
    return false;
  }

  const { url } = message;
  if (!isAllowedProductUrl(url)) {
    sendResponse({ ok: false, error: 'Blocked: URL is not an allowed product page.' });
    return false;
  }

  (async () => {
    try {
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

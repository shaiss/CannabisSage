/**
 * CannabisSage service worker — fetches Sunnyside product detail HTML
 * on behalf of the content script (replaces GM_xmlhttpRequest).
 */

const ALLOWED_HOSTS = new Set(['www.sunnyside.shop', 'sunnyside.shop']);

function isAllowedProductUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    if (!ALLOWED_HOSTS.has(url.hostname)) return false;
    // Product detail pages: /product/:id (optionally with query)
    if (!/^\/product\/[^/]+\/?$/.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'FETCH_PRODUCT_HTML') {
    return false;
  }

  const { url } = message;
  if (!isAllowedProductUrl(url)) {
    sendResponse({ ok: false, error: 'Blocked: URL is not an allowed Sunnyside product page.' });
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

  // Keep the message channel open for the async response.
  return true;
});

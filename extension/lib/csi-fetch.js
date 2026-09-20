/**
 * Product HTML parse + cached fetch via background worker.
 * Delegates store-specific parsing / URL resolution to the active adapter.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  function parseProductHtml(html, url) {
    const adapter = CSI.registry?.getActiveAdapter?.() || CSI.registry?.resolveAdapter?.(url);
    if (adapter?.parseProductHtml) {
      return adapter.parseProductHtml(html, url);
    }
    // Fallback minimal scrape
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return {
      cannabinoids: {},
      terpenes: [],
      url,
      name: doc.querySelector('h1')?.textContent?.trim(),
      status: 'empty'
    };
  }

  function fetchProductDetails(url, options = {}) {
    const { bypassCache = false } = options;
    return new Promise(async (resolve) => {
      if (!url) {
        resolve({ error: 'Unable to determine product URL', status: 'error' });
        return;
      }

      if (!bypassCache && CSI.storage) {
        const cached = await CSI.storage.getPdpCache(url);
        if (cached) {
          CSI.log('cache hit', url);
          resolve({ ...cached, status: cached.status || 'ok', fromCache: true });
          return;
        }
      }

      try {
        chrome.runtime.sendMessage({ type: 'FETCH_PRODUCT_HTML', url }, async (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              error: chrome.runtime.lastError.message || 'Extension messaging failed',
              status: 'error'
            });
            return;
          }
          if (!response || !response.ok) {
            resolve({
              error: (response && response.error) || 'Failed to fetch product details',
              status: 'error'
            });
            return;
          }
          try {
            const parsed = parseProductHtml(response.html, response.finalUrl || url);
            const empty =
              !CSI.hasCannabinoidInfo(parsed.cannabinoids) && !CSI.hasTerpeneInfo(parsed.terpenes);
            if (empty) parsed.status = 'empty';
            if (CSI.storage) await CSI.storage.setPdpCache(url, parsed);
            resolve(parsed);
          } catch (e) {
            CSI.warn('Parse error', e);
            resolve({ error: 'Failed to parse product data', status: 'error' });
          }
        });
      } catch (e) {
        resolve({ error: e.message || 'Failed to request product details', status: 'error' });
      }
    });
  }

  const BRIDGE_SOURCE = 'cannabis-sage-bridge';
  let bridgeSeq = 0;

  function requestBridgeExtract(cardEl, timeoutMs = 900) {
    return new Promise((resolve) => {
      if (!cardEl) {
        resolve(null);
        return;
      }
      const requestId = `csi-${Date.now()}-${++bridgeSeq}`;
      const marker = requestId;
      cardEl.dataset.csiBridgeId = marker;
      const adapter = CSI.registry?.getActiveAdapter?.();
      const strategy = adapter?.bridgeStrategy || 'sunnyside';

      const onMessage = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== BRIDGE_SOURCE || data.direction !== 'result') return;
        if (data.requestId !== requestId) return;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        resolve(data.result || null);
      };

      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, timeoutMs);

      window.addEventListener('message', onMessage);
      window.postMessage(
        {
          source: BRIDGE_SOURCE,
          direction: 'request',
          requestId,
          action: 'extractProduct',
          marker,
          strategy
        },
        '*'
      );
    });
  }

  function applyBridgeProduct(cardEl, bridgeProduct) {
    if (!cardEl || !bridgeProduct || bridgeProduct.error) return null;
    const productObj = {
      id: bridgeProduct.id,
      slug: bridgeProduct.slug,
      name: bridgeProduct.name,
      ecomm_display_name: bridgeProduct.name,
      cannabinoids: bridgeProduct.cannabinoids,
      potency: bridgeProduct.potency,
      terpenes: bridgeProduct.terpenes
    };
    const extracted = CSI.extractProductData(productObj, cardEl.dataset.csiUrl || bridgeProduct.slug);
    if (extracted) {
      storeElementProduct(cardEl, extracted);
      if (extracted.url) cardEl.dataset.csiUrl = extracted.url;
    }
    if (bridgeProduct.price != null) {
      storeElementProduct(cardEl, { price: bridgeProduct.price });
    }
    if (bridgeProduct.weightText) {
      storeElementProduct(cardEl, { weightText: bridgeProduct.weightText });
    }
    if (bridgeProduct.onSale != null) {
      storeElementProduct(cardEl, { onSale: bridgeProduct.onSale });
    }
    return getElementProduct(cardEl);
  }

  function getElementProduct(el) {
    if (!el?.dataset?.csiProductData) return null;
    try {
      return JSON.parse(el.dataset.csiProductData);
    } catch {
      return null;
    }
  }

  function storeElementProduct(el, partialData) {
    if (!el || !partialData) return;
    const existing = getElementProduct(el) || {};
    const merged = {
      ...existing,
      ...partialData,
      cannabinoids: {
        ...(existing.cannabinoids || {}),
        ...(partialData.cannabinoids || {})
      }
    };
    if (partialData.terpenes !== undefined) {
      if (Array.isArray(partialData.terpenes)) {
        if (partialData.terpenes.length) merged.terpenes = partialData.terpenes;
      } else if (partialData.terpenes) {
        merged.terpenes = partialData.terpenes;
      }
    }
    try {
      el.dataset.csiProductData = JSON.stringify(merged);
    } catch (e) {
      CSI.warn('Failed to cache element product', e);
    }
  }

  async function resolveProductUrl(cardEl) {
    if (!cardEl) return null;
    if (cardEl.dataset.csiUrl) return cardEl.dataset.csiUrl;

    const adapter = CSI.registry?.getActiveAdapter?.();
    const bridgeProduct = await requestBridgeExtract(cardEl);
    const fromBridge = applyBridgeProduct(cardEl, bridgeProduct);
    if (fromBridge?.url) {
      const clean = String(fromBridge.url).split(/[?#]/)[0].replace(/\/$/, '');
      cardEl.dataset.csiUrl = clean;
      return clean;
    }

    if (bridgeProduct?.slug && adapter?.buildProductUrl) {
      const url = adapter.buildProductUrl(bridgeProduct.slug);
      if (url) {
        const clean = url.split(/[?#]/)[0].replace(/\/$/, '');
        cardEl.dataset.csiUrl = clean;
        storeElementProduct(cardEl, { url: clean });
        return clean;
      }
    }
    if (bridgeProduct?.id && adapter?.buildProductUrl) {
      const url = adapter.buildProductUrl(bridgeProduct.id);
      // Only use id-built URLs when adapter produces a real PDP path (Sunnyside)
      if (url && adapter.isAllowedFetchUrl?.(url)) {
        const clean = url.split(/[?#]/)[0].replace(/\/$/, '');
        cardEl.dataset.csiUrl = clean;
        storeElementProduct(cardEl, { url: clean });
        return clean;
      }
    }

    const fromDom = adapter?.resolveProductUrlFromDom?.(cardEl) || null;
    if (fromDom) {
      const clean = fromDom.split(/[?#]/)[0].replace(/\/$/, '');
      cardEl.dataset.csiUrl = clean;
      storeElementProduct(cardEl, { url: clean });
      return clean;
    }

    return null;
  }

  CSI.parseProductHtml = parseProductHtml;
  CSI.fetchProductDetails = fetchProductDetails;
  CSI.requestBridgeExtract = requestBridgeExtract;
  CSI.applyBridgeProduct = applyBridgeProduct;
  CSI.getElementProduct = getElementProduct;
  CSI.storeElementProduct = storeElementProduct;
  CSI.resolveProductUrl = resolveProductUrl;
})(typeof globalThis !== 'undefined' ? globalThis : window);

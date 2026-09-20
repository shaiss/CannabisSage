/**
 * Product HTML parse + cached fetch via background worker.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  function parseProductHtml(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cannabinoids = {};
    const cannabinoidText = doc.body?.textContent || '';

    const thcMatch = cannabinoidText.match(/THC[:\s]+(\d+\.?\d*)%/i);
    if (thcMatch) cannabinoids.THC = thcMatch[1];
    const thcaMatch = cannabinoidText.match(/THCA[:\s]+(\d+\.?\d*)%/i);
    if (thcaMatch) cannabinoids.THCA = thcaMatch[1];
    const cbdMatch = cannabinoidText.match(/CBD[:\s]+(\d+\.?\d*)%/i);
    if (cbdMatch) cannabinoids.CBD = cbdMatch[1];
    const cbdaMatch = cannabinoidText.match(/CBDa[:\s]+(\d+\.?\d*)%/i);
    if (cbdaMatch) cannabinoids.CBDa = cbdaMatch[1];

    const terpenes = [];
    const terpeneHeading = Array.from(doc.querySelectorAll('h6, h5, h4, h3')).find(
      (h) => h.textContent.trim().toLowerCase() === 'terpenes'
    );
    const terpeneSection = terpeneHeading ? terpeneHeading.closest('section, div, article') : null;
    const sectionText = (terpeneSection ? terpeneSection.innerText : doc.body?.innerText || '').trim();

    CSI.TERPENE_CANON.forEach(({ name, keys }) => {
      const synPattern = keys.map((s) => CSI.escapeRegExp(s)).join('|');
      const re = new RegExp(`(?:${synPattern})[\\n\\r\\t\\s:]*([0-9]+(?:\\.[0-9]+)?)%`, 'gi');
      let m;
      while ((m = re.exec(sectionText)) !== null) {
        const pct = parseFloat(m[1]);
        if (Number.isNaN(pct)) continue;
        const existing = terpenes.find((t) => t.name === name);
        if (!existing) terpenes.push({ name, percentage: pct });
        else if (pct > existing.percentage) existing.percentage = pct;
      }
    });

    let terpeneResult;
    if (terpenes.length > 0) {
      terpeneResult = terpenes;
    } else {
      const totalTerpsMatch = (sectionText || cannabinoidText).match(
        /Total\s*Terpenes\s*:?[\s]*([0-9]+(?:\.[0-9]+)?)%/i
      );
      if (totalTerpsMatch) {
        const totalVal = parseFloat(totalTerpsMatch[1]);
        if (!Number.isNaN(totalVal)) terpeneResult = { 'Total Terpenes': totalVal };
      }
    }

    const title = doc.querySelector('h1')?.textContent?.trim() || doc.title?.split('|')[0]?.trim();
    const price = CSI.parsePrice(doc.body?.innerText || '');

    return {
      cannabinoids,
      terpenes: terpeneResult || terpenes,
      url,
      name: title || undefined,
      price: price || undefined,
      status: 'ok'
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
          marker
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
    const extracted = CSI.extractProductData(productObj, cardEl.dataset.csiUrl);
    if (extracted) {
      storeElementProduct(cardEl, extracted);
      if (extracted.url) cardEl.dataset.csiUrl = extracted.url;
    }
    // Attach listing-only fields from bridge
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

    const bridgeProduct = await requestBridgeExtract(cardEl);
    const fromBridge = applyBridgeProduct(cardEl, bridgeProduct);
    if (fromBridge?.url) return fromBridge.url;
    if (bridgeProduct?.id) {
      const url = CSI.buildProductUrl(bridgeProduct.id);
      if (url) {
        cardEl.dataset.csiUrl = url;
        return url;
      }
    }

    const root =
      cardEl.closest('[data-cy="ProductListItem"]') ||
      cardEl.closest('li') ||
      cardEl.parentElement ||
      cardEl;

    for (const selector of ['a[href*="/product/"]', '[href*="/product/"]']) {
      const link = root.querySelector?.(selector);
      if (!link) continue;
      const href = link.getAttribute('href') || link.href;
      if (href && href.includes('/product/')) {
        const url = href.startsWith('http')
          ? href.split(/[?#]/)[0]
          : `https://www.sunnyside.shop${href.split(/[?#]/)[0]}`;
        cardEl.dataset.csiUrl = url;
        return url;
      }
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

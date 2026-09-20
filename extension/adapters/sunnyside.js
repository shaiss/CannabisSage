/**
 * Sunnyside store adapter (primary).
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const HOSTS = ['www.sunnyside.shop', 'sunnyside.shop'];

  function matchesUrl(urlLike) {
    const host = CSI.adapterInterface.hostOf(urlLike);
    return HOSTS.includes(host);
  }

  function routeMode(pathname) {
    const path = pathname || '';
    if (/^\/product\//.test(path)) return 'pdp';
    if (/^\/products\//.test(path)) return 'listing';
    return null;
  }

  function buildProductUrl(idOrSlug) {
    if (!idOrSlug) return null;
    const cleaned = String(idOrSlug).replace(/^\/product\//, '').replace(/^\//, '');
    if (!cleaned) return null;
    return `https://www.sunnyside.shop/product/${cleaned}`;
  }

  function isAllowedFetchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') return false;
      if (!HOSTS.includes(url.hostname)) return false;
      return /^\/product\/[^/]+\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }

  function findProductCards() {
    const primary = Array.from(document.querySelectorAll('[data-cy="ProductListItem"]'));
    if (primary.length) return primary;
    const fallbacks = [
      'main .cursor-pointer.border-radius-6',
      'main [class*="Product"]',
      'ul[role="list"] li button',
      'main ul li button'
    ];
    for (const selector of fallbacks) {
      try {
        const nodes = Array.from(document.querySelectorAll(selector)).filter(isLikelyProductCard);
        if (nodes.length) return nodes;
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('[data-cy="ProductListItem"]')) return true;
    if (element.closest?.('[data-cy="ProductListItem"]')) return true;
    const isInFilter = !!element.closest?.(
      'aside, [aria-label*="Filter" i], [class*="filter" i], [id*="filter" i], #csi-filter-bar'
    );
    if (isInFilter) return false;
    const root = element.closest?.('li') || element;
    const hasImage = !!root.querySelector?.('img');
    const hasPrice = /\$\s*\d/.test(root.textContent || '');
    return hasImage && hasPrice;
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest('[data-cy="ProductListItem"]')?.parentElement ||
      cardEl.closest('li') ||
      cardEl.parentElement ||
      cardEl
    );
  }

  function resolveProductUrlFromDom(cardEl) {
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
        return href.startsWith('http')
          ? href.split(/[?#]/)[0]
          : `https://www.sunnyside.shop${href.split(/[?#]/)[0]}`;
      }
    }
    return null;
  }

  function parseListingHints(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    return {
      price: CSI.parsePrice(text),
      onSale: CSI.detectSale(host),
      weightText: (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] || null
    };
  }

  /** Generic HTML chem scrape used when React bridge lacks detail. */
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

  const sunnysideAdapter = {
    id: 'sunnyside',
    displayName: 'Sunnyside',
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://www.sunnyside.shop/*',
      'https://sunnyside.shop/*'
    ],
    categoryUrlPatterns: [/^\/products\/[^/]+/i],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: '[data-cy="ProductListItem"]',
      link: 'a[href*="/product/"]'
    },
    pdpSelectors: {
      root: '[data-cy*="Product"], main',
      title: 'h1'
    },
    buildProductUrl,
    parseProductHtml,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    parseListingHints,
    isAllowedFetchUrl,
    bridgeStrategy: 'sunnyside',
    notes: 'Primary built-in adapter. React fiber bridge supplies listing/PDP props.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.sunnyside = sunnysideAdapter;
})(typeof globalThis !== 'undefined' ? globalThis : window);

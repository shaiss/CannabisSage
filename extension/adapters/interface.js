/**
 * Store adapter contract (documentation + light runtime helpers).
 *
 * Each built-in adapter is a plain object registered in registry.js.
 * Core owns UI (tooltip, badges, compare, filters, sort, taste-map, export).
 * Adapters own site-specific URL matching, DOM selectors, and chem parsing only.
 *
 * Required fields:
 *   id, displayName, matchHosts, matchPatterns, matchesUrl, routeMode,
 *   listingSelectors, pdpSelectors, buildProductUrl, parseProductHtml,
 *   findProductCards, isLikelyProductCard, cardHost, resolveProductUrlFromDom,
 *   isAllowedFetchUrl, bridgeStrategy
 *
 * Optional:
 *   parseListingHints(cardEl) → { price, onSale, weightText, cannabinoids, terpenes }
 *   detectSale(el), categoryUrlPatterns, notes
 *
 * Do NOT load adapters from the network — Chrome Web Store forbids remote code.
 */
(function (global) {
  'use strict';

  const REQUIRED = [
    'id',
    'displayName',
    'matchHosts',
    'matchPatterns',
    'matchesUrl',
    'routeMode',
    'listingSelectors',
    'pdpSelectors',
    'buildProductUrl',
    'parseProductHtml',
    'findProductCards',
    'isLikelyProductCard',
    'cardHost',
    'resolveProductUrlFromDom',
    'isAllowedFetchUrl',
    'bridgeStrategy'
  ];

  function validateAdapter(adapter) {
    if (!adapter || typeof adapter !== 'object') {
      return { ok: false, missing: REQUIRED.slice() };
    }
    const missing = REQUIRED.filter((k) => adapter[k] == null);
    return { ok: missing.length === 0, missing };
  }

  function hostOf(urlLike) {
    try {
      return new URL(urlLike, location?.href || 'https://example.com').hostname;
    } catch {
      return '';
    }
  }

  global.CSI = global.CSI || {};
  global.CSI.adapterInterface = { REQUIRED, validateAdapter, hostOf };
})(typeof globalThis !== 'undefined' ? globalThis : window);

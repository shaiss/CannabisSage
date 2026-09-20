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
 *   shouldSuppressListingCannabinoidBadges(cardEl) → boolean (retail already shows THC/CBD)
 *   pdpChemSurface: 'floating-panel' | 'inline-buybox' (default: floating-panel only in core)
 *   detectSale(el), categoryUrlPatterns, notes
 *
 * Provenance (only fields the menu payload actually has — core omits the rest):
 *   source_sku or menuSource → "Menu source" (not a retailer name, not an image URL)
 *   labName / laboratory / labTests.labName → lab label (potency labels like THC are not a lab)
 *   testedAt → test date; mfg_date / packagedAt → packaged date
 * Do not invent a lab, a date, or a source. Do not pass brand, promo dates, or sourceUrl.
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

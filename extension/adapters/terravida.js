/**
 * TerraVida Holistic Centers adapter.
 *
 * Findings (2026-09):
 * - terravidahc.com is a Squarespace marketing site; /menu redirects away from
 *   any usable ecommerce catalog (not a product storefront).
 * - terravida.com redirects to an unrelated third-party site.
 * - Zen Leaf Malvern (zenleafdispensaries.com/locations/malvern/...) is the live
 *   ecommerce menu for the Malvern location associated with TerraVida Holistic
 *   Centers LLC. There is no separate TerraVida product host to permission.
 *
 * This adapter therefore aliases Zen Leaf Malvern paths only (more specific than
 * the general Zen Leaf adapter) so UI can label the store as TerraVida when the
 * user shops that location. Parsing/DOM logic is shared with Zen Leaf — no
 * invented hostnames.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');
  const shared = CSI.adapters?._zenleafShared;
  if (!shared) throw new Error('Zen Leaf adapter must load before TerraVida');

  const MALVERN_LISTING_RE =
    /^\/locations\/malvern\/(?:(?:medical|recreational)-menu\/)?menu\/?$/i;
  const MALVERN_PDP_RE =
    /^\/locations\/malvern\/(?:(?:medical|recreational)-menu\/)?menu\/[^/]+\/[^/]+\/?$/i;

  function matchesUrl(urlLike) {
    try {
      const url = new URL(urlLike, location?.href || 'https://zenleafdispensaries.com/');
      if (!shared.HOSTS.includes(url.hostname)) return false;
      const path = url.pathname.split(/[?#]/)[0];
      return MALVERN_LISTING_RE.test(path) || MALVERN_PDP_RE.test(path);
    } catch {
      return false;
    }
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    if (MALVERN_PDP_RE.test(path)) return 'pdp';
    if (MALVERN_LISTING_RE.test(path)) return 'listing';
    return null;
  }

  const terravidaAdapter = {
    id: 'terravida',
    displayName: 'TerraVida (Zen Leaf Malvern)',
    matchHosts: shared.HOSTS.slice(),
    matchPatterns: [
      'https://zenleafdispensaries.com/locations/malvern/*',
      'https://www.zenleafdispensaries.com/locations/malvern/*'
    ],
    categoryUrlPatterns: [MALVERN_LISTING_RE],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: '[data-testid="product-card"]',
      grid: '[data-testid="product-grid"]',
      link: 'a[data-testid="product-card-title-link"]'
    },
    pdpSelectors: {
      root: 'main, [data-testid="product-details"]',
      title: 'h1'
    },
    buildProductUrl: shared.buildProductUrl,
    parseProductHtml: shared.parseProductHtml,
    findProductCards: shared.findProductCards,
    isLikelyProductCard: shared.isLikelyProductCard,
    cardHost: shared.cardHost,
    resolveProductUrlFromDom: shared.resolveProductUrlFromDom,
    parseListingHints: shared.parseListingHints,
    isAllowedFetchUrl: shared.isAllowedFetchUrl,
    bridgeStrategy: 'zenleaf',
    notes:
      'No separate TerraVida ecommerce hostname. Aliases Zen Leaf Malvern. Do not add terravidahc.com host_permissions — that site is not a product catalog.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.terravida = terravidaAdapter;
})(typeof globalThis !== 'undefined' ? globalThis : window);

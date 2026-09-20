/**
 * TEMPLATE — copy to adapters/<store-id>.js and register in registry.js.
 *
 * Checklist for contributors:
 * [ ] id (kebab-case), displayName
 * [ ] matchHosts + matchPatterns (only real ecommerce hosts you verified)
 * [ ] matchesUrl / routeMode (listing vs pdp)
 * [ ] listingSelectors + findProductCards / isLikelyProductCard / cardHost
 * [ ] resolveProductUrlFromDom + buildProductUrl + isAllowedFetchUrl
 * [ ] parseProductHtml (and optional parseListingHints for on-card chem)
 * [ ] bridgeStrategy: reuse 'sunnyside' | 'zenleaf' or extend bridge.js
 * [ ] Register in adapters/registry.js BUILTIN_ORDER (specificity matters)
 * [ ] Add host_permissions + content_scripts matches + web_accessible_resources
 *     matches in extension/manifest.json (CWS: new hosts need an extension update;
 *     optional_host_permissions is an alternative if you adopt that pattern later)
 * [ ] Justify hosts in STORE_LISTING.md + PRIVACY.md
 * [ ] Document smoke URLs in TESTING.md
 * [ ] Never load adapter code from the network (CWS remote-code policy)
 *
 * See docs/ADAPTERS.md for the full guide.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const HOSTS = ['www.example-dispensary.com'];

  const templateAdapter = {
    id: 'example-store',
    displayName: 'Example Store',
    matchHosts: HOSTS.slice(),
    matchPatterns: ['https://www.example-dispensary.com/*'],
    categoryUrlPatterns: [/^\/menu\//i],
    matchesUrl(urlLike) {
      return HOSTS.includes(CSI.adapterInterface.hostOf(urlLike));
    },
    routeMode(pathname) {
      if (/^\/product\//i.test(pathname || '')) return 'pdp';
      if (/^\/menu\//i.test(pathname || '')) return 'listing';
      return null;
    },
    listingSelectors: { card: '[data-product-card]', link: 'a[href*="/product/"]' },
    pdpSelectors: { root: 'main', title: 'h1' },
    buildProductUrl(idOrSlug) {
      if (!idOrSlug) return null;
      return `https://www.example-dispensary.com/product/${encodeURIComponent(idOrSlug)}`;
    },
    parseProductHtml(html, url) {
      // Parse cannabinoids / terpenes from PDP HTML — store-specific.
      return { url, cannabinoids: {}, terpenes: [], status: 'empty' };
    },
    findProductCards() {
      return Array.from(document.querySelectorAll(this.listingSelectors.card));
    },
    isLikelyProductCard(el) {
      return !!el?.matches?.(this.listingSelectors.card);
    },
    cardHost(cardEl) {
      return cardEl;
    },
    resolveProductUrlFromDom(cardEl) {
      const a = cardEl.querySelector?.(this.listingSelectors.link);
      const href = a?.getAttribute?.('href') || a?.href;
      return href ? (href.startsWith('http') ? href.split(/[?#]/)[0] : null) : null;
    },
    parseListingHints(cardEl) {
      const text = cardEl.textContent || '';
      return { price: CSI.parsePrice(text), onSale: CSI.detectSale(cardEl) };
    },
    isAllowedFetchUrl(rawUrl) {
      try {
        const url = new URL(rawUrl);
        return url.protocol === 'https:' && HOSTS.includes(url.hostname) && /^\/product\//.test(url.pathname);
      } catch {
        return false;
      }
    },
    bridgeStrategy: 'none',
    notes: 'Template only — not registered.'
  };

  // Intentionally not registered. Copy fields into a real adapter file.
  CSI.adapters = CSI.adapters || {};
  CSI.adapters._template = templateAdapter;
})(typeof globalThis !== 'undefined' ? globalThis : window);

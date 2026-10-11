/**
 * Curaleaf adapter (Wave 1 #5) — Sweed-backed PA menus on curaleaf.com.
 *
 * Verified: King of Prussia medical menu
 *   https://curaleaf.com/shop/pennsylvania/curaleaf-pa-king-of-prussia/menu
 * Evidence (live HTML, 2026-10):
 *   - Assets from media.sweedpos.com / static-curaleaf.sweedpos.com
 *   - Same Sweed labTests / promoPrice / unitSize payload as Zen Leaf
 *   - Cards: [data-landmark="product-card"] (no data-testid product-card)
 *   - Listing chem: "THC: 90.17%" / "CBD: 0%" on-card
 *   - PDP: named terps in sibling divs (B-Caryophyllene 1.546%, …)
 *
 * Other Curaleaf location slugs fail closed until verified.
 * HTML chem parsing is shared with Zen Leaf via CSI.adapters._sweedShared.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');
  const shared = CSI.adapters?._sweedShared || CSI.adapters?._zenleafShared;
  if (!shared) throw new Error('Sweed/Zen Leaf adapter must load before Curaleaf');

  const HOSTS = ['curaleaf.com', 'www.curaleaf.com'];

  /** Wave 1 verified location slug → display label (fail closed). */
  const VERIFIED_SLUGS = Object.freeze({
    'curaleaf-pa-king-of-prussia': 'Curaleaf King of Prussia'
  });

  /** /shop/pennsylvania/:slug/menu — PA only (matches SW fetch allowlist) */
  const LISTING_RE = /^\/shop\/pennsylvania\/([^/]+)\/menu\/?$/i;
  /** /shop/pennsylvania/:slug/menu/:categorySlug/:productSlug */
  const PDP_RE = /^\/shop\/pennsylvania\/([^/]+)\/menu\/[^/]+\/[^/]+\/?$/i;

  function hostOf(urlLike) {
    return CSI.adapterInterface.hostOf(urlLike);
  }

  function pathOf(urlLike) {
    try {
      const base = typeof location !== 'undefined' ? location.href : 'https://curaleaf.com/';
      return new URL(urlLike, base).pathname.split(/[?#]/)[0];
    } catch {
      return String(urlLike || '').split(/[?#]/)[0];
    }
  }

  function slugFromPath(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    const m = path.match(/^\/shop\/pennsylvania\/([^/]+)\//i);
    return m ? m[1].toLowerCase() : null;
  }

  function verifiedSlug(pathname) {
    const slug = slugFromPath(pathname);
    return slug && Object.prototype.hasOwnProperty.call(VERIFIED_SLUGS, slug) ? slug : null;
  }

  function matchesUrl(urlLike) {
    const hostname = hostOf(urlLike);
    if (!HOSTS.includes(hostname)) return false;
    return !!verifiedSlug(pathOf(urlLike));
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    const listing = path.match(LISTING_RE);
    const pdp = path.match(PDP_RE);
    if (pdp && verifiedSlug(path)) return 'pdp';
    if (listing && verifiedSlug(path)) return 'listing';
    return null;
  }

  function displayNameForPath(pathname) {
    const slug = verifiedSlug(pathname || '');
    if (slug) return VERIFIED_SLUGS[slug];
    return 'Curaleaf';
  }

  function buildProductUrl(hrefOrPath) {
    if (!hrefOrPath) return null;
    const raw = String(hrefOrPath).trim();
    if (raw.startsWith('http')) {
      try {
        const u = new URL(raw);
        if (!HOSTS.includes(u.hostname)) return null;
        const path = u.pathname.split(/[?#]/)[0];
        if (!PDP_RE.test(path) || !verifiedSlug(path)) return null;
        return `https://curaleaf.com${path}`;
      } catch {
        return null;
      }
    }
    const path = (raw.startsWith('/') ? raw : `/${raw}`).split(/[?#]/)[0];
    if (!PDP_RE.test(path) || !verifiedSlug(path)) return null;
    return `https://curaleaf.com${path}`;
  }

  function isAllowedFetchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') return false;
      if (!HOSTS.includes(url.hostname)) return false;
      const path = url.pathname.split(/[?#]/)[0];
      return PDP_RE.test(path) && !!verifiedSlug(path);
    } catch {
      return false;
    }
  }

  function findProductCards() {
    const cards = Array.from(document.querySelectorAll('[data-landmark="product-card"]'));
    if (cards.length) return cards;
    // Fallback: product anchors under /menu/:category/:slug
    const links = Array.from(
      document.querySelectorAll('a[href*="/shop/"][href*="/menu/"]')
    ).filter((a) => {
      const href = a.getAttribute('href') || a.href || '';
      try {
        const path = href.startsWith('http') ? new URL(href).pathname : href;
        return PDP_RE.test(path.split(/[?#]/)[0]) && verifiedSlug(path);
      } catch {
        return false;
      }
    });
    return links
      .map((a) => a.closest('[data-landmark="product-card"]') || a)
      .filter(Boolean);
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('[data-landmark="product-card"]')) return true;
    if (element.closest?.('[data-landmark="product-card"]')) return true;
    if (element.closest?.('#csi-filter-bar, [data-landmarks-header], nav')) return false;
    const text = element.textContent || '';
    return /\$\s*\d/.test(text) && (/THC/i.test(text) || !!element.querySelector?.('img'));
  }

  function cardHost(cardEl) {
    return cardEl.closest?.('[data-landmark="product-card"]') || cardEl;
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      root.matches?.('a[href*="/menu/"]')
        ? root
        : root.querySelector?.('a[href*="/menu/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    return buildProductUrl(href);
  }

  function parseListingHints(cardEl) {
    // Same on-card THC:/CBD:/$ parsing as Zen Leaf / shared Sweed helpers
    return shared.parseListingHints(cardEl);
  }

  const curaleafAdapter = {
    id: 'curaleaf',
    get displayName() {
      try {
        if (typeof location !== 'undefined') {
          return displayNameForPath(location.pathname || '');
        }
      } catch {
        /* ignore */
      }
      return 'Curaleaf King of Prussia';
    },
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://curaleaf.com/shop/pennsylvania/curaleaf-pa-king-of-prussia/*',
      'https://www.curaleaf.com/shop/pennsylvania/curaleaf-pa-king-of-prussia/*'
    ],
    categoryUrlPatterns: [LISTING_RE],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: '[data-landmark="product-card"]',
      grid: '[data-landmark="product-card"]',
      link: 'a[href*="/menu/"]'
    },
    pdpSelectors: {
      root: 'main, [data-landmark="product-details"]',
      title: 'h1'
    },
    buildProductUrl,
    parseProductHtml: shared.parseProductHtml,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    parseListingHints,
    isAllowedFetchUrl,
    // Same Sweed React-fiber + labTests bridge strategy as Zen Leaf
    bridgeStrategy: 'zenleaf',
    notes:
      'Curaleaf PA menus are Sweed-backed (same labTests/promoPrice/unitSize payload as Zen Leaf). Wave 1 verified slug: curaleaf-pa-king-of-prussia only. Cards use data-landmark=product-card (no Zen Leaf data-testid). HTML chem parse shared via _sweedShared.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.curaleaf = curaleafAdapter;
  CSI.adapters._curaleafMeta = {
    HOSTS,
    VERIFIED_SLUGS,
    LISTING_RE,
    PDP_RE,
    verifiedSlug,
    displayNameForPath
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

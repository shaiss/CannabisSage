/**
 * Dutchie multi-tenant adapter (Wave 1).
 *
 * First verified tenant: Liberty Cannabis Norristown.
 * Parent WP (`libertycannabis.com/shop/norristown/`) is a thin shell that injects
 * Dutchie's embed script, which mounts an iframe (`dutchie--iframe`) to
 * `https://dutchie.com/embedded-menu/liberty-norristown/...`.
 *
 * Chem verified on live Dutchie embed (2026-10):
 * - Listing cards: `div[data-testid="product-list-item"]` with potency spans
 *   `THC: 31.86%` / `TERPS: 1.89%` (CBD when present). Named terps are NOT on cards
 *   (optional marketing badge like "High Limonene" is presence-only).
 * - PDP: info chips for THC/TERPS plus expandable cannabinoid + named terpene
 *   breakdowns (e.g. Linalool 0.57%, Beta Caryophyllene 0.51%).
 * - GraphQL `filteredProducts` (dutchie.com/api-1/graphql) confirms listing
 *   THCContent/CBDContent/totalTerpenes/cannabinoidsV2; named terpenes arrays
 *   are null on listing payloads — named terps are PDP UI depth.
 *
 * Bridge strategy scrapes live DOM (Cloudflare often blocks background HTML fetch).
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const DUTCHIE_HOSTS = ['dutchie.com', 'www.dutchie.com'];
  const RETAILER_HOSTS = ['libertycannabis.com', 'www.libertycannabis.com'];
  const HOSTS = DUTCHIE_HOSTS.concat(RETAILER_HOSTS);

  /** Verified Dutchie embedded-menu slugs (multi-tenant allowlist). */
  const VERIFIED_SLUGS = Object.freeze({
    'liberty-norristown': 'Liberty Norristown'
  });

  /** Parent WP shop path → slug (thin shell; real menu is the Dutchie iframe). */
  const RETAILER_SHOP_SLUGS = Object.freeze({
    '/shop/norristown': 'liberty-norristown'
  });

  /** /embedded-menu/:slug/products... or /embedded-menu/:slug (menu home) */
  const LISTING_RE =
    /^\/embedded-menu\/([^/]+)\/(?:products(?:\/[^/]+)*\/?|locations\/?)?$/i;
  /** /embedded-menu/:slug/product/:productSlug */
  const PDP_RE = /^\/embedded-menu\/([^/]+)\/product\/([^/]+)\/?$/i;

  function hostOf(urlLike) {
    return CSI.adapterInterface.hostOf(urlLike);
  }

  function isDutchieHost(hostname) {
    return DUTCHIE_HOSTS.includes(hostname);
  }

  function isRetailerHost(hostname) {
    return RETAILER_HOSTS.includes(hostname);
  }

  function slugFromDutchiePath(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    const m =
      path.match(/^\/embedded-menu\/([^/]+)/i) ||
      path.match(/^\/embedded-menu\/([^/]+)\//i);
    return m ? m[1].toLowerCase() : null;
  }

  function slugFromRetailerPath(pathname) {
    const path = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    for (const [prefix, slug] of Object.entries(RETAILER_SHOP_SLUGS)) {
      if (path === prefix || path.startsWith(`${prefix}/`)) return slug;
    }
    return null;
  }

  function verifiedSlugForUrl(urlLike) {
    let hostname = '';
    let pathname = '';
    try {
      const u = new URL(urlLike, typeof location !== 'undefined' ? location.href : 'https://dutchie.com/');
      hostname = u.hostname;
      pathname = u.pathname;
    } catch {
      hostname = hostOf(urlLike);
      pathname = String(urlLike || '');
    }
    if (isDutchieHost(hostname)) {
      const slug = slugFromDutchiePath(pathname);
      return slug && VERIFIED_SLUGS[slug] ? slug : null;
    }
    if (isRetailerHost(hostname)) {
      const slug = slugFromRetailerPath(pathname);
      return slug && VERIFIED_SLUGS[slug] ? slug : null;
    }
    return null;
  }

  function matchesUrl(urlLike) {
    return !!verifiedSlugForUrl(urlLike);
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    // Parent WP shop paths are thin shells — never listing/pdp chrome there.
    if (slugFromRetailerPath(path)) return null;
    const slug = slugFromDutchiePath(path);
    if (!slug || !VERIFIED_SLUGS[slug]) return null;
    if (PDP_RE.test(path)) return 'pdp';
    if (LISTING_RE.test(path) || /^\/embedded-menu\/[^/]+\/?$/i.test(path)) return 'listing';
    if (/^\/embedded-menu\/[^/]+\/products\//i.test(path)) return 'listing';
    return null;
  }

  function displayNameForSlug(slug) {
    return VERIFIED_SLUGS[slug] || 'Dutchie';
  }

  function currentSlug() {
    try {
      if (typeof location !== 'undefined') {
        return (
          verifiedSlugForUrl(location.href) ||
          slugFromDutchiePath(location.pathname) ||
          slugFromRetailerPath(location.pathname)
        );
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function buildProductUrl(hrefOrPath) {
    if (!hrefOrPath) return null;
    const raw = String(hrefOrPath).trim();
    if (raw.startsWith('http')) {
      try {
        const u = new URL(raw);
        if (!DUTCHIE_HOSTS.includes(u.hostname)) return null;
        const path = u.pathname.split(/[?#]/)[0];
        const slug = slugFromDutchiePath(path);
        if (!slug || !VERIFIED_SLUGS[slug]) return null;
        return PDP_RE.test(path) ? `${u.origin}${path}` : null;
      } catch {
        return null;
      }
    }
    const path = (raw.startsWith('/') ? raw : `/${raw}`).split(/[?#]/)[0];
    if (!PDP_RE.test(path)) return null;
    const slug = slugFromDutchiePath(path);
    if (!slug || !VERIFIED_SLUGS[slug]) return null;
    return `https://dutchie.com${path}`;
  }

  function isAllowedFetchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') return false;
      if (!DUTCHIE_HOSTS.includes(url.hostname)) return false;
      const slug = slugFromDutchiePath(url.pathname);
      if (!slug || !VERIFIED_SLUGS[slug]) return false;
      return PDP_RE.test(url.pathname);
    } catch {
      return false;
    }
  }

  function findProductCards() {
    const cards = Array.from(document.querySelectorAll('[data-testid="product-list-item"]'));
    if (cards.length) return cards;
    // Fallback: product anchors inside the embed
    const links = Array.from(document.querySelectorAll('a[href*="/embedded-menu/"][href*="/product/"]'));
    return links
      .map((a) => a.closest('[data-testid="product-list-item"]') || a.closest('[class*="product-item"]') || a)
      .filter(Boolean);
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('[data-testid="product-list-item"]')) return true;
    if (element.closest?.('[data-testid="product-list-item"]')) return true;
    if (element.closest?.('#csi-filter-bar, [class*="filter"], aside')) return false;
    const text = element.textContent || '';
    return /\$\s*\d/.test(text) && (/\bTHC\s*:/i.test(text) || !!element.querySelector?.('img'));
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest?.('[data-testid="product-list-item"]') ||
      cardEl.closest?.('[class*="product-item-list"]') ||
      cardEl
    );
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      root.querySelector?.('a[href*="/embedded-menu/"][href*="/product/"]') ||
      root.querySelector?.('a[href*="/product/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    if (!href) return null;
    return buildProductUrl(href);
  }

  function parsePotencyLabel(text, label) {
    const re = new RegExp(`\\b${label}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*%`, 'i');
    const m = String(text || '').match(re);
    return m ? parseFloat(m[1]) : null;
  }

  function parseListingHints(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    const potencySpans = Array.from(
      host?.querySelectorAll?.('[class*="card-potency"], [class*="PotencyItem"], [data-testid*="potency"]') || []
    );
    const potencyText = potencySpans.map((el) => el.textContent || '').join(' ') || text;

    const cannabinoids = {};
    const thc = parsePotencyLabel(potencyText, 'THC');
    if (thc != null) cannabinoids.THC = thc;
    const cbd = parsePotencyLabel(potencyText, 'CBD');
    if (cbd != null) cannabinoids.CBD = cbd;

    let terpenes;
    const terps = parsePotencyLabel(potencyText, 'TERPS?');
    if (terps != null) terpenes = { 'Total Terpenes': terps };

    const prices = [...String(text).matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) =>
      parseFloat(m[1])
    );
    let price = null;
    if (prices.length) price = Math.min(...prices);

    const weightText =
      (host?.querySelector?.('[data-testid="option-tile"] [class*="tile-label"]')?.textContent || '').trim() ||
      (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] ||
      null;

    const onSale =
      /\d+\s*%\s*off/i.test(text) ||
      !!host?.querySelector?.('[class*="discount"], [class*="original-price"]');

    return {
      price,
      onSale,
      weightText,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      terpenes
    };
  }

  /** Retail cards already print THC — avoid duplicate chem badges. */
  function shouldSuppressListingCannabinoidBadges(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    return /\bTHC\s*:\s*\d/i.test(text);
  }

  function midRange(range) {
    if (!Array.isArray(range) || !range.length) return null;
    const nums = range.map(Number).filter((n) => !Number.isNaN(n));
    if (!nums.length) return null;
    if (nums.length === 1) return nums[0];
    return (Math.min(...nums) + Math.max(...nums)) / 2;
  }

  function cannabinoidKeyFromName(raw) {
    const s = String(raw || '');
    const head = s.split('(')[0].trim();
    const compact = head.replace(/\s+/g, '').toUpperCase();
    if (/^THCA/.test(compact)) return 'THCA';
    if (/^THC/.test(compact)) return 'THC';
    if (/^CBDA/.test(compact)) return 'CBDA';
    if (/^CBD/.test(compact)) return 'CBD';
    if (/^CBGA/.test(compact)) return 'CBGA';
    if (/^CBG/.test(compact)) return 'CBG';
    if (/^CBN/.test(compact)) return 'CBN';
    if (/^CBC/.test(compact)) return 'CBC';
    if (/^CBDV/.test(compact)) return 'CBDV';
    return null;
  }

  function parseCannabinoidsV2(html) {
    const out = {};
    const re =
      /"cannabinoid"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"[\s\S]{0,120}?"value"\s*:\s*([0-9.]+)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const key = cannabinoidKeyFromName(m[1]);
      const pct = parseFloat(m[2]);
      if (key && !Number.isNaN(pct) && pct > 0) out[key] = pct;
    }
    // Alternate order: value before cannabinoid.name
    const re2 =
      /"value"\s*:\s*([0-9.]+)[\s\S]{0,120}?"cannabinoid"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/gi;
    while ((m = re2.exec(html)) !== null) {
      const key = cannabinoidKeyFromName(m[2]);
      const pct = parseFloat(m[1]);
      if (key && !Number.isNaN(pct) && pct > 0 && out[key] == null) out[key] = pct;
    }
    return out;
  }

  function parseNamedTerpenesFromText(text) {
    const results = [];
    CSI.TERPENE_CANON.forEach(({ name, keys }) => {
      const syn = keys.map((s) => CSI.escapeRegExp(s)).join('|');
      const re = new RegExp(`(?:${syn})[^0-9%]{0,16}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        const pct = parseFloat(m[1]);
        if (Number.isNaN(pct) || pct <= 0 || pct > 100) continue;
        const existing = results.find((t) => t.name === name);
        if (!existing) results.push({ name, percentage: pct });
        else if (pct > existing.percentage) existing.percentage = pct;
      }
    });
    return results;
  }

  function parseProductHtml(html, url) {
    const cannabinoids = {};
    const terpenes = [];
    const text = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ');

    // GraphQL-ish embedded fields
    const thcRange = text.match(/"THCContent"\s*:\s*\{[^}]*"range"\s*:\s*\[([0-9.,\s]+)\]/);
    if (thcRange) {
      const v = midRange(thcRange[1].split(',').map((s) => parseFloat(s.trim())));
      if (v != null) cannabinoids.THC = v;
    }
    const cbdRange = text.match(/"CBDContent"\s*:\s*\{[^}]*"range"\s*:\s*\[([0-9.,\s]+)\]/);
    if (cbdRange) {
      const v = midRange(cbdRange[1].split(',').map((s) => parseFloat(s.trim())));
      if (v != null) cannabinoids.CBD = v;
    }
    Object.assign(cannabinoids, parseCannabinoidsV2(text));

    let totalTerpenes = null;
    const terpRange = text.match(/"totalTerpenes"\s*:\s*\{[^}]*"range"\s*:\s*\[([0-9.,\s]+)\]/);
    if (terpRange) {
      totalTerpenes = midRange(terpRange[1].split(',').map((s) => parseFloat(s.trim())));
    }

    // Visible chip / label text (PDP + listing SSR)
    const plain = text.replace(/<[^>]+>/g, ' ');
    if (cannabinoids.THC == null) {
      const thc = parsePotencyLabel(plain, 'THC');
      if (thc != null) cannabinoids.THC = thc;
    }
    if (cannabinoids.CBD == null) {
      const cbd = parsePotencyLabel(plain, 'CBD');
      if (cbd != null) cannabinoids.CBD = cbd;
    }
    if (totalTerpenes == null) {
      totalTerpenes = parsePotencyLabel(plain, 'TERPS?') ?? parsePotencyLabel(plain, 'TERPENES?');
    }

    // Named cannabinoids in visible rows (THCA: 32.09%)
    ['THCA', 'CBGA', 'CBG', 'CBN', 'CBC', 'CBDV'].forEach((key) => {
      if (cannabinoids[key] != null) return;
      const v = parsePotencyLabel(plain, key);
      if (v != null) cannabinoids[key] = v;
    });

    parseNamedTerpenesFromText(plain).forEach((t) => {
      const existing = terpenes.find((x) => x.name === t.name);
      if (!existing) terpenes.push(t);
      else if (t.percentage > existing.percentage) existing.percentage = t.percentage;
    });

    let terpeneResult = terpenes;
    if (!terpenes.length && totalTerpenes != null) {
      terpeneResult = { 'Total Terpenes': totalTerpenes };
    } else if (terpenes.length && totalTerpenes != null) {
      terpeneResult = [...terpenes, { name: 'Total Terpenes', percentage: totalTerpenes }];
    }

    let name;
    const nameMatch =
      plain.match(/\b([A-Z][A-Za-z0-9'’\-\s|]+?\|\s*\d+(?:\.\d+)?g)\b/) ||
      text.match(/property="og:title"\s+content="([^"]+)"/i) ||
      text.match(/"Name"\s*:\s*"([^"]+)"/);
    if (nameMatch) name = nameMatch[1].trim();
    else {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        name =
          doc.querySelector('h1')?.textContent?.trim() ||
          doc.querySelector('[data-testid="card-strain"]')?.textContent?.trim();
      } catch {
        /* ignore */
      }
    }

    const prices = [...plain.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => parseFloat(m[1]));
    const price = prices.length ? Math.min(...prices) : CSI.parsePrice(plain);
    const onSale = /\d+\s*%\s*off/i.test(plain);
    const weightText = (plain.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] || null;

    const empty =
      !Object.keys(cannabinoids).length &&
      !(Array.isArray(terpeneResult) ? terpeneResult.length : terpeneResult && Object.keys(terpeneResult).length);

    return {
      cannabinoids,
      terpenes: terpeneResult,
      url,
      name: name || undefined,
      price: price || undefined,
      onSale: !!onSale,
      weightText: weightText || undefined,
      status: empty ? 'empty' : 'ok'
    };
  }

  const dutchieAdapter = {
    id: 'dutchie',
    get displayName() {
      const slug = currentSlug();
      if (slug) return displayNameForSlug(slug);
      return 'Dutchie';
    },
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://dutchie.com/embedded-menu/*',
      'https://www.dutchie.com/embedded-menu/*',
      'https://libertycannabis.com/shop/*',
      'https://www.libertycannabis.com/shop/*'
    ],
    categoryUrlPatterns: [/^\/embedded-menu\/[^/]+\/products/i, /^\/shop\/norristown/i],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: '[data-testid="product-list-item"]',
      link: 'a[href*="/embedded-menu/"][href*="/product/"]'
    },
    pdpSelectors: {
      root: 'main, [class*="product-detail"], body',
      title: 'h1, [data-testid="product-name"]'
    },
    buildProductUrl,
    parseProductHtml,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    parseListingHints,
    shouldSuppressListingCannabinoidBadges,
    isAllowedFetchUrl,
    bridgeStrategy: 'dutchie',
    pdpChemSurface: 'floating-panel',
    notes:
      'Multi-tenant Dutchie embed adapter. Wave 1 tenant: Liberty Norristown (dutchie.com/embedded-menu/liberty-norristown + libertycannabis.com/shop/norristown thin WP shell). Listing: THC/TERPS totals; PDP: named cannabinoids + named terpenes. Trulieve/shopd out of scope.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.dutchie = dutchieAdapter;
  CSI.adapters._dutchieShared = {
    HOSTS,
    DUTCHIE_HOSTS,
    RETAILER_HOSTS,
    VERIFIED_SLUGS,
    LISTING_RE,
    PDP_RE,
    parseProductHtml,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    parseListingHints,
    buildProductUrl,
    isAllowedFetchUrl,
    routeMode,
    matchesUrl,
    displayNameForSlug,
    verifiedSlugForUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

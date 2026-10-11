/**
 * Trulieve shopd storefront adapter (Wave 1).
 *
 * First verified store: Trulieve Limerick, PA (shopd store_id 109).
 * Menu lives on trulieve.com under `/shopd/…` (Next.js client UI). Chem is loaded
 * from the public shopd menu API the page already calls:
 *   https://api.trulieve.com/api/v2/menu/{storeId}/ALL/{category}
 *   https://api.trulieve.com/api/v2/products/{urlSlug}/{storeId}/{MEDICAL|RECREATIONAL}/
 *
 * Verified on live Limerick shopd (2026-10):
 * - Listing cards render `XX.X% THC | X.XX Terps.` (total terps only; named terps
 *   are not printed on cards even though the menu API includes them).
 * - Card href: `/shopd/product/{slug}-{sku}` (lowercased, `_` → `-`).
 * - PDP chips repeat THC / total Terps.; Top Terpenes panel lists named % values.
 * - Dispensary landing `/dispensaries/pennsylvania/limerick` is a thin locator
 *   shell (routeMode null) — enhancement runs on `/shopd/…` after store select.
 *
 * Do NOT reuse the Dutchie host adapter: Limerick shoppers use Trulieve's own
 * shopd storefront (even though inventory `source` in the API may say "dutchie").
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const HOSTS = ['trulieve.com', 'www.trulieve.com'];

  /** Verified shopd store_id → display name (localStorage `store_id`). */
  const VERIFIED_STORE_IDS = Object.freeze({
    109: 'Trulieve Limerick'
  });

  /** Thin dispensary locator shells (no product grid). */
  const DISPENSARY_LANDING_RE = /^\/dispensaries\/pennsylvania\/limerick\/?$/i;

  /** /shopd/category/... or /shopd/brands/... or /shopd */
  const LISTING_RE =
    /^\/shopd(?:\/(?:category|brands)(?:\/[^/]+)*)?\/?$/i;
  /** /shopd/product/:slug */
  const PDP_RE = /^\/shopd\/product\/[^/]+\/?$/i;
  const SHOPD_PATH_RE = /^\/shopd(?:\/|$)/i;

  function hostOf(urlLike) {
    return CSI.adapterInterface.hostOf(urlLike);
  }

  function pathOf(urlLike) {
    try {
      const u = new URL(urlLike, typeof location !== 'undefined' ? location.href : 'https://trulieve.com/');
      return u.pathname.split(/[?#]/)[0];
    } catch {
      return String(urlLike || '').split(/[?#]/)[0];
    }
  }

  function currentStoreId() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem('store_id') || localStorage.getItem('storeId');
      if (!raw || raw === '0') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  function isVerifiedStoreId(id) {
    return id != null && Object.prototype.hasOwnProperty.call(VERIFIED_STORE_IDS, Number(id));
  }

  function matchesUrl(urlLike) {
    const host = hostOf(urlLike);
    if (!HOSTS.includes(host)) return false;
    const path = pathOf(urlLike);
    if (DISPENSARY_LANDING_RE.test(path)) return true;
    if (!SHOPD_PATH_RE.test(path)) return false;
    // Shopd paths activate the adapter. When a store_id is present, only verified
    // Limerick (109) is supported in Wave 1 — other Trulieve shopd stores stay dark.
    const storeId = currentStoreId();
    if (storeId != null && !isVerifiedStoreId(storeId)) return false;
    return true;
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    if (DISPENSARY_LANDING_RE.test(path)) return null;
    if (PDP_RE.test(path)) return 'pdp';
    if (LISTING_RE.test(path) || /^\/shopd\/category\//i.test(path) || /^\/shopd\/brands\//i.test(path)) {
      return 'listing';
    }
    if (/^\/shopd\/?$/i.test(path)) return 'listing';
    return null;
  }

  function displayNameForStore(storeId) {
    if (storeId != null && VERIFIED_STORE_IDS[Number(storeId)]) {
      return VERIFIED_STORE_IDS[Number(storeId)];
    }
    return 'Trulieve Limerick';
  }

  function buildProductUrl(hrefOrPath) {
    if (!hrefOrPath) return null;
    const raw = String(hrefOrPath).trim();
    if (raw.startsWith('http')) {
      try {
        const u = new URL(raw);
        if (!HOSTS.includes(u.hostname)) return null;
        const path = u.pathname.split(/[?#]/)[0];
        return PDP_RE.test(path) ? `${u.origin}${path}` : null;
      } catch {
        return null;
      }
    }
    const path = (raw.startsWith('/') ? raw : `/${raw}`).split(/[?#]/)[0];
    if (!PDP_RE.test(path)) return null;
    return `https://www.trulieve.com${path}`;
  }

  function isAllowedFetchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') return false;
      if (!HOSTS.includes(url.hostname)) return false;
      return PDP_RE.test(url.pathname);
    } catch {
      return false;
    }
  }

  function findProductCards() {
    const links = Array.from(document.querySelectorAll('a[href*="/shopd/product/"]'));
    const cards = [];
    const seen = new Set();
    links.forEach((a) => {
      const root =
        a.closest('article') ||
        a.closest('li') ||
        a.closest('[class*="product"]') ||
        a.parentElement ||
        a;
      if (!root || seen.has(root)) return;
      seen.add(root);
      cards.push(root);
    });
    return cards;
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.closest?.('#csi-filter-bar, [class*="filter"], aside, nav, header, footer')) {
      return false;
    }
    if (element.querySelector?.('a[href*="/shopd/product/"]')) return true;
    if (element.closest?.('a[href*="/shopd/product/"]')) return true;
    const text = element.textContent || '';
    return /\$\s*\d/.test(text) && (/\bTHC\b/i.test(text) || !!element.querySelector?.('img'));
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest?.('article') ||
      cardEl.closest?.('li') ||
      cardEl.closest?.('a[href*="/shopd/product/"]')?.parentElement ||
      cardEl
    );
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      (root.matches?.('a[href*="/shopd/product/"]') ? root : null) ||
      root.querySelector?.('a[href*="/shopd/product/"]') ||
      root.closest?.('a[href*="/shopd/product/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    if (!href) return null;
    return buildProductUrl(href);
  }

  /** Listing cards: `28.9% THC | 2.81 Terps.` (totals only). */
  function parseShopdPotencyLine(text) {
    const src = String(text || '');
    const cannabinoids = {};
    const thcPct = src.match(/(\d+(?:\.\d+)?)\s*%\s*THC\b/i);
    const thcMg = src.match(/(\d+(?:\.\d+)?)\s*mg\s*THC\b/i);
    if (thcPct) cannabinoids.THC = parseFloat(thcPct[1]);
    else if (thcMg) cannabinoids.THC = parseFloat(thcMg[1]);

    const cbdPct = src.match(/(\d+(?:\.\d+)?)\s*%\s*CBD\b/i);
    if (cbdPct) {
      const v = parseFloat(cbdPct[1]);
      if (v > 0) cannabinoids.CBD = v;
    }

    let totalTerpenes = null;
    const terps = src.match(/(\d+(?:\.\d+)?)\s*%?\s*Terps?\.?/i);
    if (terps) totalTerpenes = parseFloat(terps[1]);

    return { cannabinoids, totalTerpenes };
  }

  function parseListingHints(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    const { cannabinoids, totalTerpenes } = parseShopdPotencyLine(text);

    const prices = [...String(text).matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) =>
      parseFloat(m[1])
    );
    const price = prices.length ? Math.min(...prices) : CSI.parsePrice(text);
    const weightText = (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] || null;
    const onSale =
      /\d+\s*%\s*off/i.test(text) ||
      /(?:was|was:)\s*\$/i.test(text) ||
      !!host?.querySelector?.('[class*="old-price"], [class*="sale"]');

    // Listing-bar rule: THC + total terpenes only (no named terp % on cards).
    const terpenes = totalTerpenes != null ? { 'Total Terpenes': totalTerpenes } : undefined;

    return {
      price,
      onSale,
      weightText,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      terpenes
    };
  }

  function shouldSuppressListingCannabinoidBadges(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    return /\d+(?:\.\d+)?\s*%?\s*THC\b/i.test(text);
  }

  function cannabinoidKeyFromName(raw) {
    const s = String(raw || '');
    const head = s.split('(')[0].trim();
    const compact = head.replace(/\s+/g, '').toUpperCase();
    if (/^THCA/.test(compact)) return 'THCA';
    if (/^THC/.test(compact)) return 'THC';
    if (/^CBDA/.test(compact)) return 'CBDA';
    if (/^CBDV/.test(compact)) return 'CBDV';
    if (/^CBD/.test(compact)) return 'CBD';
    if (/^CBGA/.test(compact)) return 'CBGA';
    if (/^CBG/.test(compact)) return 'CBG';
    if (/^CBN/.test(compact)) return 'CBN';
    if (/^CBC/.test(compact)) return 'CBC';
    return null;
  }

  function terpeneKeyPattern(rawKey) {
    const escaped = CSI.escapeRegExp(rawKey);
    const lower = String(rawKey).toLowerCase();
    if (lower === 'pinene') return `(?<![a-z-])${escaped}`;
    if (lower === 'a-pinene' || lower === 'b-pinene') return `(?<![a-z])${escaped}`;
    return escaped;
  }

  function parseNamedTerpenesFromText(text) {
    const results = [];
    CSI.TERPENE_CANON.forEach(({ name, keys }) => {
      const syn = keys.map((s) => terpeneKeyPattern(s)).join('|');
      const re = new RegExp(`(?:${syn})\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'gi');
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

  function parseNamedTerpenesFromApi(list) {
    const results = [];
    if (!Array.isArray(list)) return results;
    list.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const unit = String(row.unit || row.unitSymbol || '').toUpperCase();
      // Listing-bar / panel chem expects percentages; skip mg/g rows.
      if (unit && !/PERCENT/i.test(unit) && unit !== '%') return;
      const pct = Number(row.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return;
      const rawName = row.name || row.terpene?.name;
      if (!rawName) return;
      const name = CSI.canonicalizeTerpeneName(rawName) || rawName;
      const existing = results.find((t) => t.name === name);
      if (!existing) results.push({ name, percentage: pct });
      else if (pct > existing.percentage) existing.percentage = pct;
    });
    return results;
  }

  function parseProductFromApiJson(data, url) {
    const cannabinoids = {};
    if (data.thc_content != null && Number(data.thc_content) > 0) {
      cannabinoids.THC = Number(data.thc_content);
    }
    if (data.cbd_content != null && Number(data.cbd_content) > 0) {
      cannabinoids.CBD = Number(data.cbd_content);
    }
    if (Array.isArray(data.cannabinoids)) {
      data.cannabinoids.forEach((row) => {
        const key = cannabinoidKeyFromName(row?.name);
        const pct = Number(row?.value);
        if (key && Number.isFinite(pct) && pct > 0) cannabinoids[key] = pct;
      });
    }

    const named = parseNamedTerpenesFromApi(data.terpenes);
    let totalTerpenes = named.reduce((sum, t) => sum + t.percentage, 0);
    if (!named.length) totalTerpenes = null;
    else totalTerpenes = Math.round(totalTerpenes * 1000) / 1000;

    let terpeneResult = named;
    if (!named.length && totalTerpenes != null) {
      terpeneResult = { 'Total Terpenes': totalTerpenes };
    } else if (named.length && totalTerpenes != null) {
      terpeneResult = [...named, { name: 'Total Terpenes', percentage: totalTerpenes }];
    }

    const price =
      data.unit_price != null
        ? Number(data.unit_price)
        : data.med_unit_price != null
          ? Number(data.med_unit_price)
          : undefined;
    const onSale = Array.isArray(data.specials) && data.specials.length > 0;

    const empty =
      !Object.keys(cannabinoids).length &&
      !(Array.isArray(terpeneResult) ? terpeneResult.length : terpeneResult && Object.keys(terpeneResult).length);

    const result = {
      cannabinoids,
      terpenes: terpeneResult,
      url,
      name: data.name || undefined,
      price: price != null && !Number.isNaN(price) ? price : undefined,
      onSale: !!onSale,
      weightText: data.subcategory || undefined,
      status: empty ? 'empty' : 'ok'
    };
    if (data.sku || data.product_id) {
      const provenance = CSI.readProvenance?.({
        source_sku: String(data.sku || data.product_id)
      });
      if (provenance) result.provenance = provenance;
    }
    return result;
  }

  function parseProductHtml(html, url) {
    const raw = String(html || '').trim();
    // Public shopd API JSON (fixtures / future SW fetch of api.trulieve.com).
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw);
        const product = Array.isArray(data) ? data[0] : data;
        if (product && (product.thc_content != null || product.terpenes || product.name)) {
          return parseProductFromApiJson(product, url);
        }
      } catch {
        /* fall through to HTML/text parse */
      }
    }

    const cannabinoids = {};
    const text = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
    const line = parseShopdPotencyLine(text);
    Object.assign(cannabinoids, line.cannabinoids);

    // Named cannabinoids in visible rows (THCA 26.51%)
    ['THCA', 'CBGA', 'CBG', 'CBN', 'CBC', 'CBDV'].forEach((key) => {
      if (cannabinoids[key] != null) return;
      const m = text.match(new RegExp(`\\b${key}\\b[^0-9%]{0,12}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'i'));
      if (m) cannabinoids[key] = parseFloat(m[1]);
    });

    const named = parseNamedTerpenesFromText(text);
    let totalTerpenes = line.totalTerpenes;
    let terpeneResult = named;
    if (!named.length && totalTerpenes != null) {
      terpeneResult = { 'Total Terpenes': totalTerpenes };
    } else if (named.length && totalTerpenes != null) {
      terpeneResult = [...named, { name: 'Total Terpenes', percentage: totalTerpenes }];
    } else if (named.length && totalTerpenes == null) {
      const sum = named.reduce((s, t) => s + t.percentage, 0);
      terpeneResult = [...named, { name: 'Total Terpenes', percentage: Math.round(sum * 1000) / 1000 }];
    }

    let name;
    const nameMatch = raw.match(/property="og:title"\s+content="([^"]+)"/i);
    if (nameMatch) name = nameMatch[1].trim();
    else {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        name = doc.querySelector('h1')?.textContent?.trim();
      } catch {
        /* ignore */
      }
    }

    const prices = [...text.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => parseFloat(m[1]));
    const price = prices.length ? Math.min(...prices) : CSI.parsePrice(text);
    const onSale = /\d+\s*%\s*off/i.test(text);
    const weightText = (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] || null;

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

  const shopdAdapter = {
    id: 'shopd',
    get displayName() {
      return displayNameForStore(currentStoreId());
    },
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://trulieve.com/shopd/*',
      'https://www.trulieve.com/shopd/*',
      'https://trulieve.com/dispensaries/pennsylvania/limerick*',
      'https://www.trulieve.com/dispensaries/pennsylvania/limerick*'
    ],
    categoryUrlPatterns: [/^\/shopd\/category\//i, /^\/shopd\/?$/i],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: 'a[href*="/shopd/product/"]',
      link: 'a[href*="/shopd/product/"]'
    },
    pdpSelectors: {
      root: 'main, body',
      title: 'h1'
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
    bridgeStrategy: 'shopd',
    pdpChemSurface: 'floating-panel',
    notes:
      'Trulieve shopd adapter. Wave 1 store: Limerick PA (store_id 109). Listing: THC + total Terps. from on-card line; PDP: named terpene %. Public menu API at api.trulieve.com (same endpoints the page calls). Not the Dutchie embed adapter.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.shopd = shopdAdapter;
  CSI.adapters._shopdShared = {
    HOSTS,
    VERIFIED_STORE_IDS,
    LISTING_RE,
    PDP_RE,
    parseProductHtml,
    parseProductFromApiJson,
    parseListingHints,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    buildProductUrl,
    isAllowedFetchUrl,
    routeMode,
    matchesUrl,
    displayNameForStore,
    currentStoreId,
    parseShopdPotencyLine
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

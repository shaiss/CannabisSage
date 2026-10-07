/**
 * iHeartJane multi-tenant adapter (Wave 1).
 *
 * First host: RISE Cannabis medical menus on risecannabis.com
 * (e.g. King of Prussia `/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/`).
 * URL shape is store-agnostic so sibling PA RISE locations share this adapter.
 * Beyond Hello (Wave 1 #4) can extend HOSTS later without a rewrite.
 *
 * Verified on live RISE KoP HTML (2026-10):
 * - Listing cards: `article[data-testid^="product-card-"]` with
 *   `product-card-potency-*` text like `Total THC 46.24%`
 * - PDP Next.js flight payload embeds `percentThc`, `inventoryPotencies`, and
 *   pipe-separated terpene percents in `productDescription`
 *   (e.g. `Caryophyllene: 0.418% | Myrcene: 0.313% | ...`)
 * - Product assets / uploads come from iheartjane.com CDNs (Jane-powered menu)
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const HOSTS = ['risecannabis.com', 'www.risecannabis.com'];

  /** /dispensaries/:state/:slug/:storeId/(medical|recreational)-menu */
  const LISTING_RE =
    /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/?$/i;
  /** .../medical-menu/product/:productId/:slug */
  const PDP_RE =
    /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/product\/\d+\/[^/]+\/?$/i;

  const HOST_LABELS = {
    'risecannabis.com': 'RISE',
    'www.risecannabis.com': 'RISE'
  };

  function hostOf(urlLike) {
    return CSI.adapterInterface.hostOf(urlLike);
  }

  function matchesUrl(urlLike) {
    return HOSTS.includes(hostOf(urlLike));
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    if (PDP_RE.test(path)) return 'pdp';
    if (LISTING_RE.test(path)) return 'listing';
    return null;
  }

  function displayNameForHost(hostname) {
    return HOST_LABELS[hostname] || HOST_LABELS[String(hostname || '').replace(/^www\./, '')] || 'RISE';
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
    return `https://risecannabis.com${path}`;
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
    const cards = Array.from(document.querySelectorAll('article[data-testid^="product-card-"]'));
    if (cards.length) return cards;
    // Fallback: any element with a product-card-* test id that is not a child control
    const roots = Array.from(document.querySelectorAll('[data-testid^="product-card-"]')).filter(
      (el) => {
        const id = el.getAttribute('data-testid') || '';
        return /^product-card-\d+$/i.test(id);
      }
    );
    return roots;
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('article[data-testid^="product-card-"]')) return true;
    if (element.closest?.('article[data-testid^="product-card-"]')) return true;
    if (element.closest?.('#csi-filter-bar, [data-testid="product-filter-bar"], [data-testid="filter-drawer"]')) {
      return false;
    }
    const text = element.textContent || '';
    return (
      /\$\s*\d/.test(text) &&
      (/Total\s*THC/i.test(text) || !!element.querySelector?.('img'))
    );
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest?.('article[data-testid^="product-card-"]') ||
      cardEl.closest?.('[data-testid^="product-card-"]') ||
      cardEl
    );
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      root.querySelector?.('a[href*="/medical-menu/product/"]') ||
      root.querySelector?.('a[href*="/recreational-menu/product/"]') ||
      root.querySelector?.('a[href*="/product/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    if (!href) return null;
    return buildProductUrl(href);
  }

  function parseTotalThc(text) {
    const m = String(text || '').match(/Total\s*THC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (m) return parseFloat(m[1]);
    const single = String(text || '').match(/\bTHC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
    return single ? parseFloat(single[1]) : null;
  }

  function parseListingHints(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    const potencyEl = host?.querySelector?.('[data-testid^="product-card-potency-"]');
    const priceEl = host?.querySelector?.('[data-testid^="product-card-price-"]');
    const originalEl = host?.querySelector?.('[data-testid^="product-card-original-price-"]');
    const weightEl = host?.querySelector?.('[data-testid^="product-card-weight-option-"]');

    const cannabinoids = {};
    const thc = parseTotalThc(potencyEl?.textContent || text);
    if (thc != null) cannabinoids.THC = thc;
    const cbd = String(potencyEl?.textContent || text).match(/\bCBD\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (cbd) cannabinoids.CBD = parseFloat(cbd[1]);

    const price = CSI.parsePrice(priceEl?.textContent || text);
    const onSale =
      !!host?.querySelector?.('[data-testid^="product-card-sale-badge-"]') ||
      !!originalEl ||
      /\b\d+\s*%\s*OFF\b/i.test(text) ||
      CSI.detectSale(host);

    const weightText =
      (weightEl?.textContent || '').trim() ||
      (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] ||
      null;

    return {
      price,
      onSale,
      weightText,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined
    };
  }

  /** Retail cards already print Total THC — avoid duplicate chem badges. */
  function shouldSuppressListingCannabinoidBadges(cardEl) {
    const host = cardHost(cardEl);
    const potency = host?.querySelector?.('[data-testid^="product-card-potency-"]')?.textContent || '';
    const text = potency || host?.textContent || '';
    return /Total\s*THC\s*:?\s*\d/i.test(text) || /\bTHC\s*:?\s*\d/i.test(text);
  }

  function unescapeJsonFragment(fragment) {
    return String(fragment)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function parseTerpenesFromDescription(desc) {
    const results = [];
    if (!desc) return results;
    // Lab line is before the marketing blurb separator
    const head = String(desc).split(/\r?\n--\r?\n|\s--\s/)[0];
    const re =
      /([A-Za-z][A-Za-z0-9αβ./\-]*)\s*[\u00a0\s]*:\s*(\d+(?:\.\d+)?)\s*%/g;
    let m;
    while ((m = re.exec(head)) !== null) {
      const rawName = m[1];
      // Skip cannabinoid labels that sometimes appear in excluded lists
      if (/^(THC|THCA|THC8|THC9|CBD|CBDA|CBG|CBGA|TAC)$/i.test(rawName)) continue;
      const pct = parseFloat(m[2]);
      if (Number.isNaN(pct) || pct < 0 || pct > 100) continue;
      if (pct === 0) continue;
      const name = CSI.canonicalizeTerpeneName(rawName) || rawName;
      const existing = results.find((t) => t.name === name);
      if (!existing) results.push({ name, percentage: pct });
      else if (pct > existing.percentage) existing.percentage = pct;
    }
    return results;
  }

  function firstNumber(html, patterns) {
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  function parseProductHtml(html, url) {
    const cannabinoids = {};
    const terpenes = [];

    const percentThc = firstNumber(html, [
      /\\"percentThc\\":\s*([0-9.]+)/,
      /"percentThc":\s*([0-9.]+)/,
      /\\"percent_thc\\":\s*([0-9.]+)/,
      /"percent_thc":\s*([0-9.]+)/
    ]);
    if (percentThc != null) cannabinoids.THC = percentThc;

    const thcPotency = firstNumber(html, [
      /\\"thc_potency\\":\s*([0-9.]+)/,
      /"thc_potency":\s*([0-9.]+)/
    ]);
    if (cannabinoids.THC == null && thcPotency != null) cannabinoids.THC = thcPotency;

    const thcaPotency = firstNumber(html, [
      /\\"thca_potency\\":\s*([0-9.]+)/,
      /"thca_potency":\s*([0-9.]+)/
    ]);
    if (thcaPotency != null && thcaPotency > 0) cannabinoids.THCA = thcaPotency;

    const cbdPotency = firstNumber(html, [
      /\\"cbd_potency\\":\s*([0-9.]+)/,
      /"cbd_potency":\s*([0-9.]+)/,
      /\\"percent_cbd\\":\s*([0-9.]+)/,
      /"percent_cbd":\s*([0-9.]+)/
    ]);
    if (cbdPotency != null && cbdPotency > 0) cannabinoids.CBD = cbdPotency;

    if (cannabinoids.THC == null) {
      const visible = parseTotalThc(html.replace(/<[^>]+>/g, ' '));
      if (visible != null) cannabinoids.THC = visible;
    }

    // Terpenes from productDescription pipe list in flight payload
    const descMatch =
      html.match(/\\"productDescription\\":\s*\\"((?:[^"\\]|\\.)*)\\"/) ||
      html.match(/"productDescription":\s*"((?:[^"\\]|\\.)*)"/);
    if (descMatch) {
      const desc = unescapeJsonFragment(descMatch[1]);
      parseTerpenesFromDescription(desc).forEach((t) => {
        const existing = terpenes.find((x) => x.name === t.name);
        if (!existing) terpenes.push(t);
        else if (t.percentage > existing.percentage) existing.percentage = t.percentage;
      });
    }

    // Visible / text fallback for named terpenes with percentages
    if (!terpenes.length) {
      CSI.TERPENE_CANON.forEach(({ name, keys }) => {
        const syn = keys.map((s) => CSI.escapeRegExp(s)).join('|');
        const re = new RegExp(`(?:${syn})[^0-9%]{0,12}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'gi');
        let m;
        while ((m = re.exec(html)) !== null) {
          const pct = parseFloat(m[1]);
          if (Number.isNaN(pct) || pct <= 0 || pct > 100) continue;
          const existing = terpenes.find((t) => t.name === name);
          if (!existing) terpenes.push({ name, percentage: pct });
          else if (pct > existing.percentage) existing.percentage = pct;
        }
      });
    }

    let price = firstNumber(html, [/\\"price\\":\s*([0-9.]+)/, /"price":\s*([0-9.]+)/]);
    if (price == null) price = CSI.parsePrice(html.replace(/<[^>]+>/g, ' '));

    const originalPrice = firstNumber(html, [
      /\\"originalPrice\\":\s*([0-9.]+)/,
      /"originalPrice":\s*([0-9.]+)/,
      /\\"parsePrice\\":\s*([0-9.]+)/
    ]);
    const offerText = /\\"offerText\\":\s*\\?"[^"\\]*\d+\s*%\s*off/i.test(html);
    const onSale =
      offerText ||
      (originalPrice != null && price != null && price < originalPrice) ||
      /\b\d+\s*%\s*off\b/i.test(html);

    let name;
    const nameMatch =
      html.match(/\\"name\\":\s*\\"([^\\"]+)\\"\s*,\s*\\"offerText/) ||
      html.match(/\\"name\\":\s*\\"([^\\"]+)\\"\s*,\s*\\"offerTextForSegmentEvent/) ||
      html.match(/property="og:title"\s+content="([^"]+)"/i);
    if (nameMatch) name = nameMatch[1];
    else {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        name = doc.querySelector('h1')?.textContent?.trim();
      } catch {
        /* ignore */
      }
    }

    const weightMatch =
      html.match(/\\"productSizes\\":\s*\[\s*\{\s*\\"label\\":\s*\\"([^\\"]+)\\"/) ||
      html.match(/"productSizes":\s*\[\s*\{\s*"label":\s*"([^"]+)"/);
    const weightText = weightMatch ? weightMatch[1] : null;

    let productId = null;
    const idMatch =
      html.match(/\\"productId\\":\s*(\d+)/) ||
      html.match(/"productId":\s*(\d+)/) ||
      (url && String(url).match(/\/product\/(\d+)\//));
    if (idMatch) productId = idMatch[1];

    const empty =
      !Object.keys(cannabinoids).length && !(Array.isArray(terpenes) && terpenes.length);
    const result = {
      cannabinoids,
      terpenes,
      url,
      name: name || undefined,
      price: price != null ? price : undefined,
      onSale: !!onSale,
      weightText: weightText || undefined,
      status: empty ? 'empty' : 'ok'
    };
    if (productId) {
      const provenance = CSI.readProvenance?.({ source_sku: String(productId) });
      if (provenance) result.provenance = provenance;
    }
    return result;
  }

  const iheartjaneAdapter = {
    id: 'iheartjane',
    get displayName() {
      try {
        if (typeof location !== 'undefined' && location.hostname) {
          return displayNameForHost(location.hostname);
        }
      } catch {
        /* ignore */
      }
      return 'RISE';
    },
    matchHosts: HOSTS.slice(),
    matchPatterns: ['https://risecannabis.com/*', 'https://www.risecannabis.com/*'],
    categoryUrlPatterns: [
      /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/?$/i
    ],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: 'article[data-testid^="product-card-"]',
      grid: '[data-testid="product-grid"]',
      link: 'a[href*="/medical-menu/product/"], a[href*="/recreational-menu/product/"]'
    },
    pdpSelectors: {
      root: 'main',
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
    bridgeStrategy: 'none',
    pdpChemSurface: 'floating-panel',
    notes:
      'Multi-tenant iHeartJane adapter. Wave 1 host: RISE (risecannabis.com) medical-menu paths. Chem from listing potency nodes + PDP flight payload (percentThc, productDescription terp percents). Beyond Hello out of scope for this slice.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.iheartjane = iheartjaneAdapter;
  CSI.adapters._iheartjaneShared = {
    HOSTS,
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
    displayNameForHost
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

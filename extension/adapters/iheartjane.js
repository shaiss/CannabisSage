/**
 * iHeartJane multi-tenant adapter (Wave 1).
 *
 * Hosts:
 * - RISE Cannabis medical menus on risecannabis.com
 *   (e.g. King of Prussia `/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/`).
 * - Beyond Hello partner-hosted Jane Boost menus on beyond-hello.com
 *   (Wave 1 #4: West Chester medical menu; other BH locations fail closed).
 *
 * Verified on live RISE KoP HTML (2026-10):
 * - Listing cards: `article[data-testid^="product-card-"]` with
 *   `product-card-potency-*` text like `Total THC 46.24%`
 * - PDP Next.js flight payload embeds `percentThc`, `inventoryPotencies`, and
 *   pipe-separated terpene percents in `productDescription`
 * - Product assets / uploads come from iheartjane.com CDNs (Jane-powered menu)
 *
 * Verified on live Beyond Hello West Chester (2026-10):
 * - Frameless Jane Boost on `beyond-hello.com` (top-frame; `isFramelessEmbedMode`)
 * - Listing: `/pennsylvania-dispensaries/west-chester/medical-menu/`
 * - PDP: `.../medical-menu/menu/products/:productId/:slug`
 * - storeId 1640 / embedConfigId 4149; CDN `boost-assets.iheartjane.com`
 * - Cards: `a[href*="/menu/products/"]` with on-card `THC XX.XX%` (no RISE testids)
 * - PDP SSR meta `name="og:description"` carries pipe terpene percents; THC is
 *   client-rendered (live outerHTML scrape on PDP covers it)
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const RISE_HOSTS = ['risecannabis.com', 'www.risecannabis.com'];
  const BH_HOSTS = ['beyond-hello.com', 'www.beyond-hello.com'];
  const HOSTS = RISE_HOSTS.concat(BH_HOSTS);

  /** Beyond Hello location slug → display label (fail closed for other slugs). */
  const BH_VERIFIED_SLUGS = Object.freeze({
    'west-chester': 'Beyond Hello West Chester'
  });

  /** /dispensaries/:state/:slug/:storeId/(medical|recreational)-menu */
  const RISE_LISTING_RE =
    /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/?$/i;
  /** .../medical-menu/product/:productId/:slug */
  const RISE_PDP_RE =
    /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/product\/\d+\/[^/]+\/?$/i;

  /** /pennsylvania-dispensaries/:slug/medical-menu[/menu] */
  const BH_LISTING_RE =
    /^\/pennsylvania-dispensaries\/([^/]+)\/medical-menu\/?(?:menu\/?)?$/i;
  /** .../medical-menu/menu/products/:productId/:slug */
  const BH_PDP_RE =
    /^\/pennsylvania-dispensaries\/([^/]+)\/medical-menu\/menu\/products\/(\d+)\/([^/]+)\/?$/i;

  // Back-compat aliases used by smoke harness / shared exports
  const LISTING_RE = RISE_LISTING_RE;
  const PDP_RE = RISE_PDP_RE;

  const HOST_LABELS = {
    'risecannabis.com': 'RISE',
    'www.risecannabis.com': 'RISE',
    'beyond-hello.com': 'Beyond Hello',
    'www.beyond-hello.com': 'Beyond Hello'
  };

  function hostOf(urlLike) {
    return CSI.adapterInterface.hostOf(urlLike);
  }

  function pathOf(urlLike) {
    try {
      const base = typeof location !== 'undefined' ? location.href : 'https://risecannabis.com/';
      return new URL(urlLike, base).pathname.split(/[?#]/)[0];
    } catch {
      return String(urlLike || '').split(/[?#]/)[0];
    }
  }

  function isRiseHost(hostname) {
    return RISE_HOSTS.includes(hostname);
  }

  function isBhHost(hostname) {
    return BH_HOSTS.includes(hostname);
  }

  function bhSlugFromPath(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    const m = path.match(/^\/pennsylvania-dispensaries\/([^/]+)\//i);
    return m ? m[1].toLowerCase() : null;
  }

  function verifiedBhSlug(pathname) {
    const slug = bhSlugFromPath(pathname);
    return slug && Object.prototype.hasOwnProperty.call(BH_VERIFIED_SLUGS, slug) ? slug : null;
  }

  function matchesUrl(urlLike) {
    const hostname = hostOf(urlLike);
    if (isRiseHost(hostname)) return true;
    if (isBhHost(hostname)) {
      return !!verifiedBhSlug(pathOf(urlLike));
    }
    return false;
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    if (RISE_PDP_RE.test(path) || BH_PDP_RE.test(path)) return 'pdp';
    if (RISE_LISTING_RE.test(path) || BH_LISTING_RE.test(path)) return 'listing';
    return null;
  }

  function displayNameForHost(hostname, pathname) {
    if (isBhHost(hostname)) {
      const slug = verifiedBhSlug(pathname || '');
      if (slug) return BH_VERIFIED_SLUGS[slug];
      return 'Beyond Hello';
    }
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
        if (isRiseHost(u.hostname) && RISE_PDP_RE.test(path)) {
          return `${u.origin}${path}`;
        }
        if (isBhHost(u.hostname) && BH_PDP_RE.test(path) && verifiedBhSlug(path)) {
          // Canonical apex origin so www/apex share cache + taste-profile keys
          return `https://beyond-hello.com${path}`;
        }
        return null;
      } catch {
        return null;
      }
    }
    const path = (raw.startsWith('/') ? raw : `/${raw}`).split(/[?#]/)[0];
    if (RISE_PDP_RE.test(path)) return `https://risecannabis.com${path}`;
    if (BH_PDP_RE.test(path) && verifiedBhSlug(path)) return `https://beyond-hello.com${path}`;
    return null;
  }

  function isAllowedFetchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'https:') return false;
      if (!HOSTS.includes(url.hostname)) return false;
      if (isRiseHost(url.hostname)) return RISE_PDP_RE.test(url.pathname);
      if (isBhHost(url.hostname)) {
        return BH_PDP_RE.test(url.pathname) && !!verifiedBhSlug(url.pathname);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * querySelectorAll across the light DOM and open shadow roots (recursive).
   * Jane Boost menus (e.g. partner-hosted embeds) keep product cards inside
   * an open shadow root on #shadow-host — document.querySelectorAll misses them.
   */
  function querySelectorAllDeep(selector, root) {
    const start = root || (typeof document !== 'undefined' ? document : null);
    if (!start?.querySelectorAll) return [];
    const out = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      try {
        out.push(...node.querySelectorAll(selector));
      } catch {
        /* invalid selector in this root */
      }
      let elements;
      try {
        elements = node.querySelectorAll('*');
      } catch {
        return;
      }
      for (const el of elements) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(start);
    return out;
  }

  function findProductCards() {
    const cards = querySelectorAllDeep('article[data-testid^="product-card-"]');
    if (cards.length) return cards;
    // RISE fallback: product-card-* test id roots
    const roots = querySelectorAllDeep('[data-testid^="product-card-"]').filter((el) => {
      const id = el.getAttribute('data-testid') || '';
      return /^product-card-\d+$/i.test(id);
    });
    if (roots.length) return roots;

    // Beyond Hello Jane Boost: hashed CSS modules — card = product PDP link root.
    // Links often live under open shadow roots (div#shadow-host).
    const links = querySelectorAllDeep(
      'a[href*="/medical-menu/menu/products/"], a[href*="/menu/products/"]'
    );
    const bhCards = [];
    const seen = new Set();
    links.forEach((a) => {
      const href = a.getAttribute('href') || a.href || '';
      const built = buildProductUrl(href);
      if (!built || seen.has(built)) return;
      seen.add(built);
      // Prefer a small card wrapper; fall back to the anchor itself
      const root =
        a.closest('[class*="product"]') ||
        a.closest('article') ||
        a.closest('li') ||
        a.parentElement ||
        a;
      bhCards.push(root);
    });
    return bhCards;
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('article[data-testid^="product-card-"]')) return true;
    if (element.closest?.('article[data-testid^="product-card-"]')) return true;
    if (element.closest?.('#csi-filter-bar, [data-testid="product-filter-bar"], [data-testid="filter-drawer"]')) {
      return false;
    }
    if (
      element.matches?.('a[href*="/menu/products/"]') ||
      element.closest?.('a[href*="/menu/products/"]') ||
      element.querySelector?.('a[href*="/menu/products/"]')
    ) {
      return true;
    }
    const text = element.textContent || '';
    return (
      /\$\s*\d/.test(text) &&
      (/Total\s*THC/i.test(text) || /\bTHC\s+\d/i.test(text) || !!element.querySelector?.('img'))
    );
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest?.('article[data-testid^="product-card-"]') ||
      cardEl.closest?.('[data-testid^="product-card-"]') ||
      cardEl.closest?.('a[href*="/menu/products/"]') ||
      cardEl
    );
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      root.querySelector?.('a[href*="/medical-menu/product/"]') ||
      root.querySelector?.('a[href*="/recreational-menu/product/"]') ||
      root.querySelector?.('a[href*="/menu/products/"]') ||
      root.querySelector?.('a[href*="/product/"]') ||
      (root.matches?.('a[href*="/menu/products/"]') ? root : null) ||
      (root.matches?.('a[href*="/product/"]') ? root : null);
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    if (!href) return null;
    return buildProductUrl(href);
  }

  function parseTotalThc(text) {
    const m = String(text || '').match(/Total\s*THC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (m) return parseFloat(m[1]);
    // Beyond Hello listing cards: "THC 24.88%" (no "Total")
    const plain = String(text || '').match(/\bTHC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
    return plain ? parseFloat(plain[1]) : null;
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

  /** Retail cards already print Total THC / THC — avoid duplicate chem badges. */
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

  function unescapeHtmlEntities(text) {
    return String(text || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

  function metaContent(html, names) {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
        'i'
      );
      const m = html.match(re);
      if (m) return unescapeHtmlEntities(m[1] || m[2] || '');
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
    if (cannabinoids.CBD == null) {
      const cbdVis = String(html.replace(/<[^>]+>/g, ' ')).match(/\bCBD\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
      if (cbdVis) cannabinoids.CBD = parseFloat(cbdVis[1]);
    }

    // Terpenes from productDescription pipe list in flight payload (RISE)
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

    // Beyond Hello Jane Boost SSR: pipe terps in og/twitter description meta
    if (!terpenes.length) {
      const ogDesc =
        metaContent(html, ['og:description', 'twitter:description']) ||
        metaContent(html, ['description']);
      if (ogDesc && /:\s*\d+(?:\.\d+)?\s*%/.test(ogDesc)) {
        parseTerpenesFromDescription(ogDesc).forEach((t) => {
          const existing = terpenes.find((x) => x.name === t.name);
          if (!existing) terpenes.push(t);
          else if (t.percentage > existing.percentage) existing.percentage = t.percentage;
        });
      }
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
      null;
    if (nameMatch) name = nameMatch[1];
    if (!name) {
      const ogTitle = metaContent(html, ['og:title', 'twitter:title']);
      // BH product titles look like "Jawa Lemon Crunch | Double Bear | Distillate Cartridge"
      // Skip generic storefront titles that name the menu/location only.
      if (
        ogTitle &&
        !/medical\s+cannabis\s+menu/i.test(ogTitle) &&
        !/^beyond\s*\/?\s*hello/i.test(ogTitle)
      ) {
        name = ogTitle.split('|')[0].trim();
      }
    }
    if (!name) {
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
      (url && String(url).match(/\/products?\/(\d+)\//));
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
          return displayNameForHost(location.hostname, location.pathname || '');
        }
      } catch {
        /* ignore */
      }
      return 'RISE';
    },
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://risecannabis.com/*',
      'https://www.risecannabis.com/*',
      'https://beyond-hello.com/*',
      'https://www.beyond-hello.com/*'
    ],
    categoryUrlPatterns: [
      /^\/dispensaries\/[^/]+\/[^/]+\/\d+\/(?:medical|recreational)-menu\/?$/i,
      /^\/pennsylvania-dispensaries\/[^/]+\/medical-menu\/?(?:menu\/?)?$/i
    ],
    matchesUrl,
    routeMode,
    listingSelectors: {
      card: 'article[data-testid^="product-card-"], a[href*="/menu/products/"]',
      grid: '[data-testid="product-grid"]',
      link: 'a[href*="/medical-menu/product/"], a[href*="/recreational-menu/product/"], a[href*="/menu/products/"]'
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
      'Multi-tenant iHeartJane adapter. Hosts: RISE (risecannabis.com) medical-menu paths; Beyond Hello West Chester (beyond-hello.com partner-hosted Jane Boost, verified slug west-chester only — other BH locations fail closed). Chem from listing potency / THC text + PDP flight payload or og:description terp percents.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.iheartjane = iheartjaneAdapter;
  CSI.adapters._iheartjaneShared = {
    HOSTS,
    RISE_HOSTS,
    BH_HOSTS,
    BH_VERIFIED_SLUGS,
    LISTING_RE,
    PDP_RE,
    RISE_LISTING_RE,
    RISE_PDP_RE,
    BH_LISTING_RE,
    BH_PDP_RE,
    parseProductHtml,
    findProductCards,
    querySelectorAllDeep,
    isLikelyProductCard,
    cardHost,
    resolveProductUrlFromDom,
    parseListingHints,
    buildProductUrl,
    isAllowedFetchUrl,
    routeMode,
    matchesUrl,
    displayNameForHost,
    verifiedBhSlug
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

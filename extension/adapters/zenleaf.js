/**
 * Zen Leaf Dispensaries adapter (PA ecommerce: zenleafdispensaries.com).
 *
 * Sweed-backed storefront (sweedpos.com assets / labTests payload). Shared HTML
 * parsers are exported as CSI.adapters._sweedShared (and _zenleafShared alias)
 * so Curaleaf and TerraVida can reuse them without forking chemms logic.
 *
 * Menu listing cards already show THC / TERP ranges in the DOM.
 * Named terpene breakdowns and richer labTests live in PDP HTML / client state.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const HOSTS = ['zenleafdispensaries.com', 'www.zenleafdispensaries.com'];

  /** /locations/:slug/(medical|recreational)-menu/menu or /locations/:slug/menu */
  const LISTING_RE =
    /^\/locations\/[^/]+\/(?:(?:medical|recreational)-menu\/)?menu\/?$/i;
  /** .../menu/:categorySlug/:productSlug */
  const PDP_RE =
    /^\/locations\/[^/]+\/(?:(?:medical|recreational)-menu\/)?menu\/[^/]+\/[^/]+\/?$/i;

  function matchesUrl(urlLike) {
    const host = CSI.adapterInterface.hostOf(urlLike);
    return HOSTS.includes(host);
  }

  function routeMode(pathname) {
    const path = (pathname || '').split(/[?#]/)[0];
    if (PDP_RE.test(path)) return 'pdp';
    if (LISTING_RE.test(path)) return 'listing';
    return null;
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
    // Zen Leaf PDPs need full menu paths — never invent URLs from bare numeric ids
    if (!PDP_RE.test(path)) return null;
    return `https://zenleafdispensaries.com${path}`;
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
    const cards = Array.from(document.querySelectorAll('[data-testid="product-card"]'));
    if (cards.length) return cards;
    const links = Array.from(
      document.querySelectorAll('a[data-testid="product-card-title-link"]')
    );
    return links
      .map((a) => a.closest('[data-testid="product-card"]') || a.closest('[role="listitem"]') || a)
      .filter(Boolean);
  }

  function isLikelyProductCard(element) {
    if (!element) return false;
    if (element.matches?.('[data-testid="product-card"]')) return true;
    if (element.closest?.('[data-testid="product-card"]')) return true;
    if (element.closest?.('#csi-filter-bar, [data-testid="filter-sidebar"]')) return false;
    const text = element.textContent || '';
    return /\$\s*\d/.test(text) && (/THC/i.test(text) || !!element.querySelector?.('img'));
  }

  function cardHost(cardEl) {
    return (
      cardEl.closest?.('[data-testid="product-card"]') ||
      cardEl.closest?.('[role="listitem"]') ||
      cardEl
    );
  }

  /**
   * Mount point for badge row + Compare Select.
   * Sweed product-card roots are often `display:flex; flex-direction:row`
   * (`relative flex h-full w-full`). Appending chrome as a direct child turns
   * it into a tall narrow column. Prefer the inner content column (title/price
   * / ATC); otherwise use a full-width flex-basis:100% mount with wrap.
   */
  function listingMount(cardEl) {
    const root = cardHost(cardEl);
    if (!root) return cardEl;

    const title =
      root.querySelector?.('a[data-testid="product-card-title-link"]') ||
      root.querySelector?.('a[href*="/menu/"]');
    if (title) {
      let col = title.parentElement;
      while (col && col.parentElement && col.parentElement !== root) {
        col = col.parentElement;
      }
      if (col && col !== root && root.contains?.(col)) {
        return col;
      }
    }

    let mount = root.querySelector?.(':scope > .csi-listing-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'csi-listing-mount';
      mount.style.cssText =
        'flex:1 1 100%;flex-basis:100%;width:100%;max-width:100%;box-sizing:border-box;display:block;';
      try {
        const cs = typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
        const rowFlex =
          (cs &&
            cs.display === 'flex' &&
            (cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse')) ||
          (root.classList?.contains('flex') && !root.classList.contains('flex-col'));
        if (rowFlex && !root.style.flexWrap) root.style.flexWrap = 'wrap';
      } catch {
        if (!root.style.flexWrap) root.style.flexWrap = 'wrap';
      }
      root.appendChild(mount);
    }
    return mount;
  }

  function resolveProductUrlFromDom(cardEl) {
    const root = cardHost(cardEl);
    const link =
      root.querySelector?.('a[data-testid="product-card-title-link"]') ||
      root.querySelector?.('a[href*="/menu/"]');
    if (!link) return null;
    const href = link.getAttribute('href') || link.href;
    if (!href) return null;
    const path = href.startsWith('http') ? new URL(href).pathname : href;
    if (!PDP_RE.test(path.split(/[?#]/)[0])) return null;
    return buildProductUrl(href);
  }

  function midRange(a, b) {
    if (a == null && b == null) return null;
    if (b == null) return a;
    if (a == null) return b;
    return (a + b) / 2;
  }

  function parseRangePercents(text, label) {
    const re = new RegExp(
      `${label}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*%`,
      'i'
    );
    const m = String(text || '').match(re);
    if (!m) {
      const single = String(text || '').match(
        new RegExp(`${label}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*%`, 'i')
      );
      if (!single) return null;
      return parseFloat(single[1]);
    }
    return midRange(parseFloat(m[1]), parseFloat(m[2]));
  }

  function parseListingHints(cardEl) {
    const host = cardHost(cardEl);
    const text = host?.textContent || '';
    const cannabinoids = {};
    const thc = parseRangePercents(text, 'THC');
    if (thc != null) cannabinoids.THC = thc;
    const cbd = parseRangePercents(text, 'CBD');
    if (cbd != null) cannabinoids.CBD = cbd;

    let terpenes;
    const terp = parseRangePercents(text, 'TERP(?:ENES)?');
    if (terp != null) terpenes = { 'Total Terpenes': terp };

    const prices = [...String(text).matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) =>
      parseFloat(m[1])
    );
    let price = null;
    if (prices.length) {
      // Prefer the lower "Currently $X" when a strikethrough / off price exists
      price = Math.min(...prices);
    }

    const weightText =
      (text.match(/(\d+(?:\.\d+)?\s*(?:g|mg|oz)\b)/i) || [])[1] ||
      (text.match(/\b(\d+(?:\.\d+)?g)\b/i) || [])[1] ||
      null;

    const onSale =
      /\bSale\b|\d+\s*%\s*Off|Currently\s*\$/i.test(text) ||
      !!host?.querySelector?.('s, del, [class*="line-through"]');

    return {
      price,
      onSale,
      weightText,
      cannabinoids: Object.keys(cannabinoids).length ? cannabinoids : undefined,
      terpenes
    };
  }

  function unescapeJsonFragment(fragment) {
    return String(fragment)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n');
  }

  function labValue(node) {
    if (!node) return null;
    const v = node.value;
    if (Array.isArray(v) && v.length) {
      const nums = v.map(Number).filter((n) => !Number.isNaN(n));
      if (!nums.length) return null;
      return midRange(Math.min(...nums), Math.max(...nums));
    }
    if (typeof v === 'number') return v;
    return CSI.parsePercent(v);
  }

  function parseLabTestsObject(lab) {
    const cannabinoids = {};
    const terpenes = [];
    if (!lab || typeof lab !== 'object') return { cannabinoids, terpenes };

    const thc = labValue(lab.displayThc) ?? labValue(lab.thc);
    const cbd = labValue(lab.displayCbd) ?? labValue(lab.cbd);
    const cbn = labValue(lab.cbn);
    const cbg = labValue(lab.cbg);
    if (thc != null) cannabinoids.THC = thc;
    if (cbd != null) cannabinoids.CBD = cbd;
    if (cbn != null) cannabinoids.CBN = cbn;
    if (cbg != null) cannabinoids.CBG = cbg;

    const totalTerps = labValue(lab.terpenes);
    if (totalTerps != null) terpenes.push({ name: 'Total Terpenes', percentage: totalTerps });

    return { cannabinoids, terpenes };
  }

  function extractNamedTerpenes(html) {
    const results = [];
    const re =
      /\\?"name\\?"\s*:\s*\\?"([^\\"]+)\\?"\s*,\s*\\?"canonicalName\\?"\s*:\s*\\?"([^\\"]+)\\?"(?:\s*,\s*\\?"(?:percentage|value|percent)\\?"\s*:\s*([0-9.]+))?/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const name = CSI.canonicalizeTerpeneName(m[1]) || CSI.canonicalizeTerpeneName(m[2]) || m[1];
      const pct = m[3] != null ? parseFloat(m[3]) : null;
      if (!name) continue;
      if (pct == null || Number.isNaN(pct)) {
        // Presence-only list (common on Zen Leaf) — skip numeric until percentages appear nearby
        continue;
      }
      const existing = results.find((t) => t.name === name);
      if (!existing) results.push({ name, percentage: pct });
      else if (pct > existing.percentage) existing.percentage = pct;
    }

    // Alternate: "Myrcene": 1.2 or Myrcene 1.2% in visible text sections
    return results;
  }

  function parseProductHtml(html, url) {
    const cannabinoids = {};
    const terpenes = [];

    let provenance = null;
    // Prefer embedded labTests JSON (Next.js RSC / flight payload)
    const labMatch = html.match(/labTests\\?":\s*(\{[\s\S]*?\})(?=,\\?"saleType\\?"|,\\"saleType\\?"|,"saleType")/);
    if (labMatch) {
      try {
        const raw = unescapeJsonFragment(labMatch[1]);
        const lab = JSON.parse(raw);
        const parsed = parseLabTestsObject(lab);
        provenance = CSI.mergeProvenance(provenance, CSI.readProvenance({ labTests: lab }));
        Object.assign(cannabinoids, parsed.cannabinoids);
        parsed.terpenes.forEach((t) => {
          if (t.name === 'Total Terpenes') {
            /* keep as map below */
          } else terpenes.push(t);
        });
        const tot = parsed.terpenes.find((t) => t.name === 'Total Terpenes');
        if (tot) {
          // stash via object form if no named terps yet
          if (!terpenes.length) {
            /* handled below */
          }
        }
      } catch {
        /* fall through to text */
      }
    }

    // Visible / text fallbacks
    const textMatchThc = html.match(/THC\s*:?\s*(\d+(?:\.\d+)?)\s*(?:-|–)\s*(\d+(?:\.\d+)?)\s*%/i);
    if (!cannabinoids.THC && textMatchThc) {
      cannabinoids.THC = midRange(parseFloat(textMatchThc[1]), parseFloat(textMatchThc[2]));
    }
    if (!cannabinoids.THC) {
      const single = html.match(/THC\s*:?\s*(\d+(?:\.\d+)?)\s*%/i);
      if (single) cannabinoids.THC = parseFloat(single[1]);
    }

    const textTerp = html.match(/TERP(?:ENES)?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:-|–)\s*(\d+(?:\.\d+)?)\s*%/i);
    let totalTerpenes = null;
    if (textTerp) totalTerpenes = midRange(parseFloat(textTerp[1]), parseFloat(textTerp[2]));

    // Named terpene percentages in page text (Sweed themes often put the %
    // in a sibling div a short hop after the label — allow up to ~80 chars).
    CSI.TERPENE_CANON.forEach(({ name, keys }) => {
      const syn = keys.map((s) => CSI.escapeRegExp(s)).join('|');
      const re = new RegExp(`(?:${syn})[^0-9%]{0,80}([0-9]+(?:\\.[0-9]+)?)\\s*%`, 'gi');
      let m;
      while ((m = re.exec(html)) !== null) {
        const pct = parseFloat(m[1]);
        if (Number.isNaN(pct) || pct > 100) continue;
        const existing = terpenes.find((t) => t.name === name);
        if (!existing) terpenes.push({ name, percentage: pct });
        else if (pct > existing.percentage) existing.percentage = pct;
      }
    });

    extractNamedTerpenes(html).forEach((t) => {
      const existing = terpenes.find((x) => x.name === t.name);
      if (!existing) terpenes.push(t);
    });

    let terpeneResult = terpenes;
    if (!terpenes.length && totalTerpenes != null) {
      terpeneResult = { 'Total Terpenes': totalTerpenes };
    } else if (terpenes.length && totalTerpenes != null) {
      terpeneResult = [...terpenes, { name: 'Total Terpenes', percentage: totalTerpenes }];
    }

    // Price: prefer promoPrice in payload, else visible $
    let price = null;
    const promo = html.match(/promoPrice\\?":\s*([0-9.]+)/);
    const base = html.match(/\\"price\\?":\s*([0-9.]+)/) || html.match(/"price":\s*([0-9.]+)/);
    if (promo) price = parseFloat(promo[1]);
    else if (base) price = parseFloat(base[1]);
    else price = CSI.parsePrice(html.replace(/<[^>]+>/g, ' '));

    const onSale =
      /\\"promoPrice\\?":\s*[1-9]|Sale|%\s*Off/i.test(html) ||
      (promo && base && parseFloat(promo[1]) < parseFloat(base[1]));

    let name;
    const nameMatch =
      html.match(/\\"ecomm_display_name\\?":\s*\\?"([^\\"]+)\\?"/) ||
      html.match(/"@type"\s*:\s*"Product"[^"]{0,20}"@id"\s*:\s*"[^"]{0,300}"\s*,\s*"name"\s*:\s*"([^"]+)"/) ||
      html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i) ||
      html.match(/property="og:title"\s+content="([^"]+)"/i);
    if (nameMatch) name = nameMatch[1].trim();
    else {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        name = doc.querySelector('h1')?.textContent?.trim();
      } catch {
        /* ignore */
      }
    }

    const weightMatch =
      html.match(/unitSize\\?":\s*\{\s*\\?"value\\?":\s*([0-9.]+)\s*,\s*\\?"unitAbbr\\?":\s*\\?"([^\\"]+)\\?"/) ||
      html.match(/unitSize":\{"value":([0-9.]+),"unitAbbr":"([^"]+)"/);
    const weightText = weightMatch ? `${weightMatch[1]}${weightMatch[2]}` : null;
    provenance = CSI.mergeProvenance(provenance, CSI.scrapeProvenanceFromHtml(html));

    const result = {
      cannabinoids,
      terpenes: terpeneResult,
      url,
      name: name || undefined,
      price: price || undefined,
      onSale: !!onSale,
      weightText: weightText || undefined,
      status: 'ok'
    };
    if (provenance) result.provenance = provenance;
    return result;
  }

  const zenleafAdapter = {
    id: 'zenleaf',
    displayName: 'Zen Leaf',
    matchHosts: HOSTS.slice(),
    matchPatterns: [
      'https://zenleafdispensaries.com/*',
      'https://www.zenleafdispensaries.com/*'
    ],
    categoryUrlPatterns: [
      /^\/locations\/[^/]+\/(?:(?:medical|recreational)-menu\/)?menu\/?$/i
    ],
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
    buildProductUrl,
    parseProductHtml,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    listingMount,
    resolveProductUrlFromDom,
    parseListingHints,
    isAllowedFetchUrl,
    bridgeStrategy: 'zenleaf',
    notes:
      'PA Zen Leaf ecommerce (orders-pa@zenleafdispensaries.com). Malvern menu: /locations/malvern/... Primary secondary store for this project.'
  };

  CSI.adapters = CSI.adapters || {};
  CSI.adapters.zenleaf = zenleafAdapter;
  // Shared Sweed helpers for TerraVida alias + Curaleaf (parseProductHtml / listing chem)
  const sweedShared = {
    HOSTS,
    LISTING_RE,
    PDP_RE,
    parseProductHtml,
    parseLabTestsObject,
    parseRangePercents,
    midRange,
    findProductCards,
    isLikelyProductCard,
    cardHost,
    listingMount,
    resolveProductUrlFromDom,
    parseListingHints,
    buildProductUrl,
    isAllowedFetchUrl,
    routeMode,
    matchesUrl
  };
  CSI.adapters._sweedShared = sweedShared;
  CSI.adapters._zenleafShared = sweedShared;
})(typeof globalThis !== 'undefined' ? globalThis : window);

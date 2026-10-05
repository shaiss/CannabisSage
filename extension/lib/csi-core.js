/**
 * CannabisSage shared core — loaded first in isolated content scripts.
 * Exposes globalThis.CSI
 */
(function (global) {
  'use strict';

  const VERSION = '1.3.20';
  const MAX_COMPARE = 3;
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
  const ACCENT_ORANGE = '#FF6B35';
  const ACCENT_DARK = '#2C3E50';

  const DEBUG =
    (typeof localStorage !== 'undefined' && localStorage.getItem('cannabisSageDebug') === '1') ||
    (typeof location !== 'undefined' && /[?&]cannabisSageDebug=1(?:&|$)/.test(location.search));

  function log(...args) {
    if (DEBUG) console.log('CannabisSage:', ...args);
  }
  function warn(...args) {
    if (DEBUG) console.warn('CannabisSage:', ...args);
  }
  function error(...args) {
    console.error('CannabisSage:', ...args);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const TERPENE_CANON = [
    { name: 'Beta-Caryophyllene', keys: ['beta-caryophyllene', 'b-caryophyllene', 'beta caryophyllene', 'caryophyllene'] },
    { name: 'Limonene', keys: ['limonene'] },
    { name: 'Humulene', keys: ['humulene'] },
    { name: 'Linalool', keys: ['linalool'] },
    { name: 'Beta-Myrcene', keys: ['beta-myrcene', 'b-myrcene', 'myrcene'] },
    { name: 'Beta-Pinene', keys: ['beta-pinene', 'b-pinene'] },
    { name: 'Alpha-Pinene', keys: ['alpha-pinene', 'a-pinene', 'pinene'] },
    { name: 'Ocimene', keys: ['ocimene'] },
    { name: 'Terpinolene', keys: ['terpinolene'] },
    { name: 'Nerolidol', keys: ['nerolidol'] },
    { name: 'Bisabolol', keys: ['bisabolol'] },
    { name: 'Caryophyllene Oxide', keys: ['caryophyllene oxide', 'caryophyllene-oxide'] },
    { name: 'Eucalyptol', keys: ['eucalyptol'] },
    { name: 'Camphene', keys: ['camphene'] },
    { name: 'Geraniol', keys: ['geraniol'] },
    { name: 'Valencene', keys: ['valencene'] },
    { name: 'Phellandrene', keys: ['alpha-phellandrene', 'beta-phellandrene', 'phellandrene'] }
  ];

  function canonicalizeTerpeneName(raw) {
    const key = String(raw || '').toLowerCase().replace(/_/g, '-').trim();
    for (const entry of TERPENE_CANON) {
      if (entry.keys.some((k) => key.includes(k))) return entry.name;
    }
    return null;
  }

  function parsePercent(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    const m = String(value).trim().match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    return Number.isNaN(num) ? null : num;
  }

  function parsePrice(text) {
    if (text == null) return null;
    const m = String(text).replace(/,/g, '').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isNaN(n) ? null : n;
  }

  function hasCannabinoidInfo(cannabinoids) {
    if (!cannabinoids || typeof cannabinoids !== 'object') return false;
    return Object.values(cannabinoids).some((value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'number') return !Number.isNaN(value);
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    });
  }

  function hasTerpeneInfo(terpenes) {
    if (!terpenes) return false;
    if (Array.isArray(terpenes)) return terpenes.length > 0;
    if (typeof terpenes === 'object') return Object.keys(terpenes).length > 0;
    if (typeof terpenes === 'string') return terpenes.trim().length > 0;
    return false;
  }

  function hasDetailedTerpeneBreakdown(terpenes) {
    if (!terpenes) return false;
    const isTotalOnlyKey = (key) => /total\s*terpene/i.test(key);
    if (Array.isArray(terpenes)) {
      if (terpenes.length === 0) return false;
      return terpenes.some((item) => {
        if (typeof item === 'string') return !/total\s*terpene/i.test(item);
        if (item && typeof item === 'object') {
          if ('name' in item && typeof item.name === 'string') return true;
          return Object.keys(item).some((k) => !isTotalOnlyKey(k));
        }
        return false;
      });
    }
    if (typeof terpenes === 'object') {
      return Object.keys(terpenes).some((k) => !isTotalOnlyKey(k));
    }
    if (typeof terpenes === 'string') return !/total\s*terpene/i.test(terpenes);
    return false;
  }

  function extractTerpenesFromObject(source) {
    const results = [];
    if (!source || typeof source !== 'object') return results;

    const addResult = (name, pct) => {
      if (!name || pct === null || pct === undefined || Number.isNaN(pct)) return;
      const existing = results.find((t) => t.name === name);
      if (!existing) results.push({ name, percentage: pct });
      else if (pct > existing.percentage) existing.percentage = pct;
    };

    const scan = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 3) return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => {
          if (item && typeof item === 'object' && 'name' in item && 'percentage' in item) {
            const name = canonicalizeTerpeneName(item.name) || String(item.name);
            addResult(name, parsePercent(item.percentage));
          } else scan(item, depth + 1);
        });
        return;
      }
      Object.entries(obj).forEach(([k, v]) => {
        const keyLc = String(k).toLowerCase();
        const maybeName = canonicalizeTerpeneName(keyLc);
        if (maybeName) {
          addResult(maybeName, parsePercent(v));
          return;
        }
        if (v && typeof v === 'object') {
          if ('name' in v && ('percentage' in v || 'percent' in v || 'value' in v)) {
            const name = canonicalizeTerpeneName(v.name) || String(v.name);
            addResult(name, parsePercent(v.percentage ?? v.percent ?? v.value));
            return;
          }
          scan(v, depth + 1);
        }
      });
    };

    scan(source, 0);
    return results.filter((t) => t.percentage !== null && !Number.isNaN(t.percentage));
  }

  function normalizeTerpeneMap(terps) {
    const map = {};
    if (!terps) return map;
    if (Array.isArray(terps)) {
      terps.forEach((t) => {
        if (t && typeof t === 'object' && t.name !== undefined) {
          const name = canonicalizeTerpeneName(t.name) || String(t.name);
          const num = parsePercent(t.percentage ?? t.value ?? t.percent);
          if (name && num !== null) map[name] = num;
        } else if (typeof t === 'string') {
          const name = canonicalizeTerpeneName(t) || t;
          const num = parsePercent(t);
          if (name && num !== null) map[name] = num;
        }
      });
      return map;
    }
    if (typeof terps === 'object') {
      Object.entries(terps).forEach(([k, v]) => {
        const name = canonicalizeTerpeneName(k) || k;
        const num = parsePercent(v);
        if (name && num !== null) map[name] = num;
      });
    }
    return map;
  }

  function totalTerpenes(terps) {
    const map = normalizeTerpeneMap(terps);
    const vals = Object.values(map).filter((n) => n > 0);
    if (!vals.length) {
      if (terps && typeof terps === 'object' && !Array.isArray(terps) && terps['Total Terpenes'] != null) {
        return parsePercent(terps['Total Terpenes']);
      }
      return null;
    }
    return vals.reduce((a, b) => a + b, 0);
  }

  function topTerpene(terps) {
    const map = normalizeTerpeneMap(terps);
    let best = null;
    Object.entries(map).forEach(([name, pct]) => {
      if (/total\s*terpene/i.test(name)) return;
      if (pct == null || pct <= 0) return;
      if (!best || pct > best.percentage) best = { name, percentage: pct };
    });
    return best;
  }

  function readThcPercent(cannabinoids) {
    if (!cannabinoids) return null;
    const candidates = [
      cannabinoids.THCA,
      cannabinoids.thca,
      cannabinoids.totalTHC,
      cannabinoids.total_thc,
      cannabinoids.THC,
      cannabinoids.thc
    ];
    for (const c of candidates) {
      const n = parsePercent(c);
      if (n !== null && n > 0) return n;
    }
    return null;
  }

  function readThcaPercent(cannabinoids) {
    if (!cannabinoids) return null;
    return parsePercent(cannabinoids.THCA ?? cannabinoids.thca ?? cannabinoids.totalTHCA);
  }

  /**
   * Listed THC-family value for UI labels. Prefers delta-9 THC, then totalTHC,
   * then THCA. The returned label is what the menu published — THCA is never
   * named THC. Distinct from readThcPercent (THCA-first for $/mg).
   */
  function readListedThcDisplay(cannabinoids) {
    if (!cannabinoids) return null;
    const candidates = [
      ['THC', cannabinoids.THC],
      ['THC', cannabinoids.thc],
      ['Total THC', cannabinoids.totalTHC],
      ['Total THC', cannabinoids.total_thc],
      ['THCA', cannabinoids.THCA],
      ['THCA', cannabinoids.thca]
    ];
    for (const [label, raw] of candidates) {
      const n = parsePercent(raw);
      if (n !== null && n > 0) return { label, percent: n };
    }
    return null;
  }

  /**
   * Numeric listed THC% (same preference as readListedThcDisplay) for
   * similarity math. Distinct from readThcPercent (THCA-first for $/mg).
   */
  function readListedThcPercent(cannabinoids) {
    const listed = readListedThcDisplay(cannabinoids);
    return listed ? listed.percent : null;
  }

  function activeAdapter() {
    return global.CSI?.registry?.getActiveAdapter?.() || global.CSI?._activeAdapter || null;
  }

  function buildProductUrl(idOrSlug) {
    const adapter = activeAdapter();
    if (adapter?.buildProductUrl) return adapter.buildProductUrl(idOrSlug);
    return null;
  }

  function extractProductData(productObj, fallbackUrl) {
    if (!productObj || typeof productObj !== 'object') return null;

    const slug = productObj.slug || productObj.productSlug || productObj.permalink || productObj.handle;
    const productId = productObj.id || productObj.productId || productObj.slugId || productObj.sku;
    const adapter = activeAdapter();
    let url = null;
    if (adapter?.buildProductUrl) {
      url = adapter.buildProductUrl(slug) || adapter.buildProductUrl(productId);
    } else {
      url = buildProductUrl(slug) || buildProductUrl(productId);
    }
    url = url || fallbackUrl;
    const name =
      productObj.ecomm_display_name ||
      productObj.bt_product_name ||
      productObj.name ||
      productObj.productName ||
      productObj.displayName;

    const cannabinoids = {};
    const sourceCannabinoids = productObj.cannabinoids;
    if (sourceCannabinoids && typeof sourceCannabinoids === 'object') {
      Object.entries(sourceCannabinoids).forEach(([key, value]) => {
        if (value !== undefined && value !== null) cannabinoids[key.toUpperCase()] = value;
      });
    }

    const potency = productObj.potency || {};
    const cannabinoidFields = {
      THC: productObj.thc ?? potency.thc ?? productObj.potency_thc ?? productObj.bt_potency_thc ?? productObj.thcPercent ?? productObj.thc_percentage,
      THCA: productObj.thca ?? potency.thca ?? productObj.potency_thca ?? productObj.bt_potency_thca,
      CBD: productObj.cbd ?? potency.cbd ?? productObj.potency_cbd ?? productObj.bt_potency_cbd ?? productObj.cbdPercent ?? productObj.cbd_percentage,
      CBDA: productObj.cbda ?? potency.cbda ?? productObj.potency_cbda ?? productObj.bt_potency_cbda,
      CBN: productObj.cbn ?? potency.cbn ?? productObj.potency_cbn ?? productObj.bt_potency_cbn,
      CBG: productObj.cbg ?? potency.cbg ?? productObj.potency_cbg ?? productObj.bt_potency_cbg,
      CBC: productObj.cbc ?? potency.cbc ?? productObj.potency_cbc ?? productObj.bt_potency_cbc
    };
    Object.entries(cannabinoidFields).forEach(([key, value]) => {
      if (value !== undefined && value !== null && !Number.isNaN(value)) cannabinoids[key] = value;
    });

    const totalTHC = productObj.totalTHC ?? productObj.total_thc ?? potency.totalTHC ?? potency.total_thc ?? productObj.usable_thc;
    const totalCBD = productObj.totalCBD ?? productObj.total_cbd ?? potency.totalCBD ?? potency.total_cbd ?? productObj.usable_cbd;
    if (totalTHC != null && !Number.isNaN(totalTHC)) cannabinoids.totalTHC = totalTHC;
    if (totalCBD != null && !Number.isNaN(totalCBD)) cannabinoids.totalCBD = totalCBD;

    let terpenes = extractTerpenesFromObject(productObj);
    if (!terpenes.length) terpenes = extractTerpenesFromObject(productObj.potency);
    if (!terpenes.length) terpenes = productObj.terpenes;
    if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
      terpenes = productObj.terpeneProfile || productObj.terpene_profile || productObj.terpeneBlend;
    }
    if (!terpenes || (Array.isArray(terpenes) && !terpenes.length)) {
      const totalTerps = productObj.potency_terps ?? potency.terps ?? productObj.bt_potency_terps;
      if (totalTerps != null && !Number.isNaN(totalTerps)) terpenes = { 'Total Terpenes': totalTerps };
    }

    const result = {};
    if (url) result.url = url;
    if (name) result.name = String(name);
    if (Object.keys(cannabinoids).length) result.cannabinoids = cannabinoids;
    if (terpenes !== undefined) result.terpenes = terpenes;
    return Object.keys(result).length ? result : null;
  }

  /** Score 0–1 against taste map preferences. */
  function scoreTasteMatch(product, tasteMap) {
    if (!tasteMap || !product) return null;
    const preferred = tasteMap.preferredTerpenes || {};
    const avoid = new Set((tasteMap.avoidTerpenes || []).map((t) => canonicalizeTerpeneName(t) || t));
    const terpMap = normalizeTerpeneMap(product.terpenes);
    const prefKeys = Object.keys(preferred);
    if (!prefKeys.length && !avoid.size) return null;

    let weighted = 0;
    let weightSum = 0;
    prefKeys.forEach((rawName) => {
      const name = canonicalizeTerpeneName(rawName) || rawName;
      const w = Number(preferred[rawName]) || 0;
      if (w <= 0) return;
      weightSum += w;
      const pct = terpMap[name];
      if (pct != null && pct > 0) {
        // Presence scaled by relative strength (cap at 1%)
        weighted += w * Math.min(1, pct / 0.5);
      }
    });

    let score = weightSum > 0 ? weighted / weightSum : 0;

    avoid.forEach((name) => {
      const pct = terpMap[name];
      if (pct != null && pct > 0.05) score -= 0.25;
    });

    if (tasteMap.preferHighTotalTerps) {
      const tot = totalTerpenes(product.terpenes);
      if (tot != null && tot >= 1.5) score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /** Cosine cutoff for same-menu neighbors. Below this, omit the row. */
  const SIMILAR_CHEM_MIN_SCORE = 0.4;
  /** Calm density on the floating PDP — not a product-card grid. */
  const SIMILAR_CHEM_MAX_NEIGHBORS = 3;
  /** When neither pick lists named terpenes, THC must be this close (percentage points). */
  const SIMILAR_CHEM_THC_NEAR_PTS = 4;

  function namedTerpenePercents(terpenes) {
    const map = normalizeTerpeneMap(terpenes);
    const named = {};
    Object.entries(map).forEach(([name, pct]) => {
      if (/total\s*terpenes?/i.test(name)) return;
      if (!(pct > 0)) return;
      named[name] = pct;
    });
    return named;
  }

  /**
   * Vector from retailer-published numbers only.
   * THC/CBD are percent/100. Named terp percents are capped at 2% → 1.0.
   * Missing values stay missing (not guessed zeros in the source product).
   */
  function chemSimilarityVector(product) {
    const dims = {};
    if (!product) return dims;
    const thc = readListedThcPercent(product.cannabinoids);
    if (thc != null && thc > 0) dims.THC = thc / 100;
    const cbd = parsePercent(
      product.cannabinoids?.CBD ?? product.cannabinoids?.cbd ?? product.cannabinoids?.totalCBD
    );
    if (cbd != null && cbd > 0) dims.CBD = cbd / 100;
    Object.entries(namedTerpenePercents(product.terpenes)).forEach(([name, pct]) => {
      dims[`t:${name}`] = Math.min(1, pct / 2);
    });
    return dims;
  }

  function cosineSimilarity(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    let dot = 0;
    let na = 0;
    let nb = 0;
    keys.forEach((k) => {
      const va = Number(a && a[k]) || 0;
      const vb = Number(b && b[k]) || 0;
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    });
    if (!(na > 0) || !(nb > 0)) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function sharedNamedTerpenes(left, right) {
    const a = namedTerpenePercents(left && left.terpenes);
    const b = namedTerpenePercents(right && right.terpenes);
    return Object.keys(a)
      .filter((name) => b[name] > 0)
      .sort((x, y) => x.localeCompare(y));
  }

  function sameMenuHost(url, host) {
    if (!host) return true;
    try {
      const u = new URL(url);
      const want = String(host).replace(/^www\./i, '').toLowerCase();
      const got = u.hostname.replace(/^www\./i, '').toLowerCase();
      return want === got;
    } catch {
      return false;
    }
  }

  /**
   * Same-menu neighbors by cosine similarity of listed chem.
   * Never invents lab numbers. Same hostname; same category when both known.
   * Named-terp rows need at least one shared terpene. Cannabinoid-only rows
   * need THC within SIMILAR_CHEM_THC_NEAR_PTS.
   */
  function rankSimilarByChem(anchor, candidates, opts) {
    const options = opts || {};
    const maxRaw = Number(options.max);
    const max = Number.isFinite(maxRaw) ? Math.max(0, maxRaw) : SIMILAR_CHEM_MAX_NEIGHBORS;
    const minRaw = Number(options.minScore);
    const minScore = Number.isFinite(minRaw) ? minRaw : SIMILAR_CHEM_MIN_SCORE;
    const list = Array.isArray(candidates) ? candidates : [];
    const result = { neighbors: [], note: '' };
    if (!anchor || anchor.status === 'error' || anchor.status === 'empty') return result;
    const anchorVec = chemSimilarityVector(anchor);
    if (!Object.keys(anchorVec).length) return result;
    const anchorHasTerps = Object.keys(anchorVec).some((k) => k.startsWith('t:'));
    const origin = options.origin;
    const anchorUrl = normalizeMenuUrl(anchor.url || '', origin);
    const categoryKey = options.categoryKey || null;
    const host = options.host || null;

    const scored = [];
    list.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const nested = raw.data && typeof raw.data === 'object' ? raw.data : raw;
      const cand = { ...nested, url: raw.url || nested.url };
      if (cand.status === 'error' || cand.status === 'empty') return;
      const url = normalizeMenuUrl(cand.url || '', origin);
      if (!url || (anchorUrl && url === anchorUrl)) return;
      if (host && !sameMenuHost(url, host)) return;
      const candCategory = cand.categoryKey || raw.categoryKey || null;
      if (categoryKey && candCategory && candCategory !== categoryKey) return;
      const vec = chemSimilarityVector(cand);
      if (!Object.keys(vec).length) return;
      const candHasTerps = Object.keys(vec).some((k) => k.startsWith('t:'));
      const shared = sharedNamedTerpenes(anchor, cand);
      if (anchorHasTerps || candHasTerps) {
        if (!shared.length) return;
      } else {
        const aThc = readListedThcPercent(anchor.cannabinoids);
        const bThc = readListedThcPercent(cand.cannabinoids);
        if (aThc == null || bThc == null) return;
        if (Math.abs(aThc - bThc) > SIMILAR_CHEM_THC_NEAR_PTS) return;
      }
      const score = cosineSimilarity(anchorVec, vec);
      if (!(score >= minScore)) return;
      scored.push({
        url,
        name: cand.name ? String(cand.name) : '',
        cannabinoids: cand.cannabinoids,
        terpenes: cand.terpenes,
        score,
        sharedTerpenes: shared,
        categoryKey: candCategory
      });
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.name || '').localeCompare(b.name || '') || a.url.localeCompare(b.url);
    });
    result.neighbors = scored.slice(0, max);
    return result;
  }

  /** Soft match floor for other-store rows. Below this, omit the row. */
  const CROSS_STORE_MIN_SCORE = 0.38;
  /** Calm density on the floating PDP (match list + optional store switcher). */
  const CROSS_STORE_MAX_MATCHES = 3;
  /** Cosine at or above this, plus matching name/size, may be called the same item. */
  const CROSS_STORE_IDENTICAL_CHEM = 0.97;
  /** Max absolute %-point gap for a shared listed cannabinoid to still count as identical. */
  const CROSS_STORE_IDENTICAL_CANNABINOID_PTS = 1.5;

  const PRODUCT_NAME_STOP = new Set([
    'the',
    'and',
    'with',
    'for',
    'from',
    'pack',
    'thc',
    'cbd',
    'thca',
    'delta',
    'live',
    'resin',
    'rosin',
    'hybrid',
    'indica',
    'sativa',
    'infused',
    'distillate',
    'cartridge',
    'cart',
    'carts',
    'vape',
    'vapes',
    'flower',
    'preroll',
    'pre-roll',
    'gummies',
    'gummy',
    'edible',
    'edibles',
    'concentrate',
    'concentrates',
    'eighth',
    'gram',
    'grams',
    'ounce',
    'mg',
    'oz'
  ]);

  const FORM_ALIASES = {
    flower: 'flower',
    bud: 'flower',
    preroll: 'flower',
    'pre-roll': 'flower',
    vape: 'vape',
    vapes: 'vape',
    cartridge: 'vape',
    cartridges: 'vape',
    carts: 'vape',
    cart: 'vape',
    concentrate: 'concentrate',
    concentrates: 'concentrate',
    shatter: 'concentrate',
    wax: 'concentrate',
    resin: 'concentrate',
    rosin: 'concentrate',
    dab: 'concentrate',
    edible: 'edible',
    edibles: 'edible',
    gummies: 'edible',
    gummy: 'edible',
    beverage: 'edible',
    tincture: 'edible',
    capsule: 'edible',
    capsules: 'edible',
    troche: 'edible',
    topical: 'topical'
  };

  function adapterIdFromUrl(url) {
    const registry = global.CSI && global.CSI.registry;
    if (!registry || !url) return null;
    try {
      return registry.resolveAdapter(url)?.id || null;
    } catch {
      return null;
    }
  }

  function adapterDisplayName(adapterId) {
    const registry = global.CSI && global.CSI.registry;
    if (!registry || !adapterId) return '';
    return (registry.getAdapterById(adapterId)?.displayName || '').trim();
  }

  function normalizeProductName(raw) {
    let s = String(raw || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’]/g, '');
    s = s.replace(/\d+(?:\.\d+)?\s*(?:mg|g|oz|ml)\b/gi, ' ');
    s = s.replace(/[^a-z0-9]+/g, ' ').trim();
    const tokens = s.split(/\s+/).filter((t) => t && t.length > 1 && !PRODUCT_NAME_STOP.has(t) && !/^\d+$/.test(t));
    return tokens.join(' ');
  }

  function nameTokenSet(raw) {
    const norm = normalizeProductName(raw);
    return new Set(norm ? norm.split(/\s+/) : []);
  }

  function nameSimilarity(a, b) {
    const na = normalizeProductName(a);
    const nb = normalizeProductName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.86;
    const sa = nameTokenSet(a);
    const sb = nameTokenSet(b);
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    sa.forEach((t) => {
      if (sb.has(t)) inter += 1;
    });
    const union = sa.size + sb.size - inter;
    return union > 0 ? inter / union : 0;
  }

  function normalizeBrand(raw) {
    const s = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return s || null;
  }

  function productFormKey(product, url) {
    const cat = normalizeCategorySlug((product && product.categoryKey) || '');
    if (cat && FORM_ALIASES[cat]) return FORM_ALIASES[cat];
    if (cat) return cat;
    try {
      const path = url ? new URL(url).pathname : '';
      const fromPath = categoryKeyFromPath(path);
      if (fromPath && FORM_ALIASES[fromPath]) return FORM_ALIASES[fromPath];
      if (fromPath) return fromPath;
    } catch {
      /* ignore */
    }
    return null;
  }

  function sizeCloseness(aGrams, bGrams) {
    if (!(aGrams > 0) || !(bGrams > 0)) return null;
    const rel = Math.abs(aGrams - bGrams) / Math.max(aGrams, bGrams);
    if (rel <= 0.05) return 1;
    if (rel <= 0.15) return 0.7;
    if (rel <= 0.35) return 0.35;
    return 0;
  }

  /** Fold common key casing/aliases. THCA stays THCA (never renamed to THC). */
  function normalizeCannabinoidKey(key) {
    const k = String(key || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    if (!k) return '';
    if (k === 'thca' || k === 'totalthca') return 'THCA';
    if (k === 'thc') return 'THC';
    if (k === 'totalthc') return 'totalTHC';
    if (k === 'cbd' || k === 'totalcbd') return 'CBD';
    if (k === 'cbda') return 'CBDa';
    if (k === 'cbg' || k === 'totalcbg') return 'CBG';
    if (k === 'cbn') return 'CBN';
    if (k === 'cbc') return 'CBC';
    return k.toUpperCase();
  }

  /**
   * Every cannabinoid both rows list must agree within tolPts.
   * Valid numeric 0 is listed (null/undefined/NaN/empty/non-numeric are not).
   * Keys present on only one side are ignored — absent is not treated as 0.
   * Empty overlap → true.
   */
  function listedCannabinoidsAgree(left, right, tolPts) {
    const tol = Number.isFinite(tolPts) ? tolPts : CROSS_STORE_IDENTICAL_CANNABINOID_PTS;
    const a = {};
    const b = {};
    Object.entries(left && typeof left === 'object' ? left : {}).forEach(([raw, val]) => {
      const key = normalizeCannabinoidKey(raw);
      const n = parsePercent(val);
      if (key && n != null && a[key] == null) a[key] = n;
    });
    Object.entries(right && typeof right === 'object' ? right : {}).forEach(([raw, val]) => {
      const key = normalizeCannabinoidKey(raw);
      const n = parsePercent(val);
      if (key && n != null && b[key] == null) b[key] = n;
    });
    const shared = Object.keys(a).filter((k) => b[k] != null);
    if (!shared.length) return true;
    return shared.every((k) => Math.abs(a[k] - b[k]) <= tol);
  }

  function listedDollarsPerMg(product) {
    if (!product) return null;
    const grams = parseWeightGrams(product.weightText);
    return dollarsPerMgThc(product.price, product.cannabinoids, grams);
  }

  function buildPdpCacheRecord(product, extras) {
    const extra = extras || {};
    if (!product || typeof product !== 'object') return null;
    const url = extra.url || product.url || '';
    if (!url) return null;
    const adapterId = extra.adapterId || product.adapterId || adapterIdFromUrl(url);
    const rec = {
      url,
      name: product.name ? String(product.name) : '',
      cannabinoids: product.cannabinoids,
      terpenes: product.terpenes,
      status: product.status || 'ok'
    };
    if (product.price != null) rec.price = product.price;
    if (product.weightText) rec.weightText = product.weightText;
    if (product.onSale != null) rec.onSale = !!product.onSale;
    const categoryKey = extra.categoryKey || product.categoryKey || null;
    if (categoryKey) rec.categoryKey = categoryKey;
    if (adapterId) rec.adapterId = adapterId;
    if (product.brand) rec.brand = product.brand;
    return rec;
  }

  function combineCrossStoreScore(parts) {
    const name = Number(parts.name) || 0;
    const chem = Number(parts.chem) || 0;
    const form = parts.form == null ? 0.4 : Number(parts.form);
    const size = parts.size == null ? 0.4 : Number(parts.size);
    const brand = parts.brand == null ? 0.4 : Number(parts.brand);
    const hasChem = parts.hasChem;
    const hasName = parts.hasName;
    if (hasChem && hasName) {
      return 0.32 * name + 0.38 * chem + 0.15 * form + 0.1 * size + 0.05 * brand;
    }
    if (hasName) {
      return 0.5 * name + 0.25 * form + 0.15 * size + 0.1 * brand;
    }
    if (hasChem) {
      return 0.55 * chem + 0.25 * form + 0.15 * size + 0.05 * brand;
    }
    return 0;
  }

  function describeCrossStoreMatch(parts) {
    if (parts.identical) return 'Same listed name, size, and chemistry — treated as the same item.';
    const bits = [];
    if (parts.chem >= 0.7) bits.push('close listed chem');
    else if (parts.chem >= 0.4) bits.push('similar listed chem');
    if (parts.name >= 0.85) bits.push('matching product name');
    else if (parts.name >= 0.45) bits.push('similar product name');
    if (parts.form === 1) bits.push('same category');
    if (parts.size != null && parts.size >= 0.7) bits.push('similar size');
    if (parts.brand === 1) bits.push('same brand');
    if (!bits.length) return 'Nearby listed chem at another store.';
    const line = bits[0].charAt(0).toUpperCase() + bits[0].slice(1);
    if (bits.length === 1) return `${line}.`;
    return `${line} and ${bits.slice(1).join(' and ')}.`;
  }

  /**
   * Other-store neighbors from already-cached listing/PDP rows.
   * Fuzzy and explainable. Never invents chem, price, or a new catalog fetch.
   * Same adapter (including same-host TerraVida vs Zen Leaf) is excluded.
   */
  function rankCrossStoreSoftMatch(anchor, candidates, opts) {
    const options = opts || {};
    const maxRaw = Number(options.max);
    const max = Number.isFinite(maxRaw) ? Math.max(0, maxRaw) : CROSS_STORE_MAX_MATCHES;
    const minRaw = Number(options.minScore);
    const minScore = Number.isFinite(minRaw) ? minRaw : CROSS_STORE_MIN_SCORE;
    const list = Array.isArray(candidates) ? candidates : [];
    const result = { matches: [], note: '' };
    if (!anchor || anchor.status === 'error' || anchor.status === 'empty') return result;

    const origin = options.origin;
    const anchorUrl = normalizeMenuUrl(anchor.url || '', origin);
    const excludeAdapter =
      options.excludeAdapterId || anchor.adapterId || adapterIdFromUrl(anchorUrl) || null;
    const anchorVec = chemSimilarityVector(anchor);
    const hasChem = Object.keys(anchorVec).length > 0;
    const hasName = !!normalizeProductName(anchor.name);
    if (!hasChem && !hasName) return result;

    const scored = [];
    list.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const nested = raw.data && typeof raw.data === 'object' ? raw.data : raw;
      const cand = { ...nested, url: raw.url || nested.url };
      if (cand.status === 'error' || cand.status === 'empty') return;
      const url = normalizeMenuUrl(cand.url || '', origin);
      if (!url || (anchorUrl && url === anchorUrl)) return;
      const adapterId = cand.adapterId || raw.adapterId || adapterIdFromUrl(url);
      if (!adapterId) return;
      if (excludeAdapter && adapterId === excludeAdapter) return;

      const nameScore = nameSimilarity(anchor.name, cand.name);
      const vec = chemSimilarityVector(cand);
      const candHasChem = Object.keys(vec).length > 0;
      const chemScore = hasChem && candHasChem ? cosineSimilarity(anchorVec, vec) : 0;
      const formA = productFormKey(anchor, anchorUrl);
      const formB = productFormKey(cand, url);
      let formScore = null;
      if (formA && formB) formScore = formA === formB ? 1 : 0;
      const gramsA = parseWeightGrams(anchor.weightText);
      const gramsB = parseWeightGrams(cand.weightText);
      const sizeScore = sizeCloseness(gramsA, gramsB);
      const brandA = normalizeBrand(anchor.brand);
      const brandB = normalizeBrand(cand.brand);
      let brandScore = null;
      if (brandA && brandB) brandScore = brandA === brandB ? 1 : 0;

      if (hasChem && candHasChem) {
        /* chem can carry a weak name */
      } else if (nameScore < 0.45) {
        return;
      }
      if (hasChem && candHasChem && chemScore < 0.28 && nameScore < 0.55) return;
      if (formScore === 0 && nameScore < 0.7 && chemScore < 0.55) return;

      const parts = {
        name: nameScore,
        chem: chemScore,
        form: formScore,
        size: sizeScore,
        brand: brandScore,
        hasChem: hasChem && candHasChem,
        hasName: hasName && !!normalizeProductName(cand.name)
      };
      const score = combineCrossStoreScore(parts);
      if (!(score >= minScore)) return;

      const cannabinoidsAgree = listedCannabinoidsAgree(
        anchor.cannabinoids,
        cand.cannabinoids,
        CROSS_STORE_IDENTICAL_CANNABINOID_PTS
      );
      const identical =
        nameScore === 1 &&
        sizeScore != null &&
        sizeScore >= 0.7 &&
        (formScore == null || formScore === 1) &&
        (brandScore == null || brandScore === 1) &&
        cannabinoidsAgree &&
        ((hasChem && candHasChem && chemScore >= CROSS_STORE_IDENTICAL_CHEM) ||
          (!hasChem && !candHasChem && nameScore === 1 && sizeScore === 1));

      parts.identical = identical;
      const dollarsPerMg = listedDollarsPerMg(cand);
      scored.push({
        url,
        name: cand.name ? String(cand.name) : '',
        cannabinoids: cand.cannabinoids,
        terpenes: cand.terpenes,
        price: cand.price != null ? cand.price : null,
        dollarsPerMg,
        weightText: cand.weightText || '',
        adapterId,
        storeLabel: adapterDisplayName(adapterId),
        score,
        identical,
        reason: describeCrossStoreMatch(parts),
        sharedTerpenes: sharedNamedTerpenes(anchor, cand),
        categoryKey: cand.categoryKey || null
      });
    });

    scored.sort((a, b) => {
      if (Number(b.identical) !== Number(a.identical)) return Number(b.identical) - Number(a.identical);
      if (b.score !== a.score) return b.score - a.score;
      return (a.name || '').localeCompare(b.name || '') || a.url.localeCompare(b.url);
    });
    result.matches = scored.slice(0, max);
    return result;
  }

  function dollarsPerMgThc(price, cannabinoids, weightGrams) {
    if (price == null || price <= 0) return null;
    const thcPct = readThcPercent(cannabinoids);
    if (thcPct == null || thcPct <= 0) return null;
    const grams = weightGrams != null && weightGrams > 0 ? weightGrams : 1;
    const mg = (thcPct / 100) * grams * 1000;
    if (mg <= 0) return null;
    return price / mg;
  }

  function parseWeightGrams(text) {
    if (!text) return null;
    const g = String(text).match(/(\d+(?:\.\d+)?)\s*g\b/i);
    if (g) return parseFloat(g[1]);
    const mg = String(text).match(/(\d+(?:\.\d+)?)\s*mg\b/i);
    if (mg) return parseFloat(mg[1]) / 1000;
    const oz = String(text).match(/(\d+(?:\.\d+)?)\s*oz\b/i);
    if (oz) return parseFloat(oz[1]) * 28.3495;
    return null;
  }

  function detectSale(el) {
    if (!el) return false;
    const text = (el.textContent || '').toLowerCase();
    if (/\b(sale|special|%\s*off|markdown)\b/.test(text)) return true;
    if (el.querySelector?.('[class*="special" i], [class*="sale" i], [data-cy*="special" i]')) return true;
    // Strikethrough price often indicates sale
    if (el.querySelector?.('s, del, [style*="line-through"]')) return true;
    return false;
  }

  /**
   * How long a menu median may be reused on a product page.
   * Freshness window only — never a stand-in price.
   */
  const DEAL_MEDIAN_TTL_MS = 2 * 60 * 60 * 1000;

  /** Fewer than this many scraped prices is not a category median. */
  const MIN_CATEGORY_PRICE_SAMPLE = 3;

  const NON_CATEGORY_SLUGS = new Set(['menu', 'product', 'products', 'search', 'all', 'shop']);

  /** A listed price we actually scraped. Zero, blank, and non-numeric are missing. */
  function positivePrice(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function normalizeMenuUrl(raw, base) {
    if (!raw) return '';
    try {
      const u = new URL(raw, base || 'https://local.invalid');
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return String(raw).split(/[?#]/)[0].replace(/\/$/, '');
    }
  }

  function normalizeCategorySlug(raw) {
    if (raw == null) return null;
    let slug = String(raw).trim().toLowerCase();
    if (!slug) return null;
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep the raw slug */
    }
    slug = slug
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-\d+$/, '');
    if (!slug || !/[a-z]/.test(slug) || NON_CATEGORY_SLUGS.has(slug)) return null;
    return slug;
  }

  /**
   * Category from a menu path when the path itself names one.
   * /products/flower → flower
   * .../menu/flower-709/slug → flower
   * /product/:id and a mixed /menu listing → null (do not invent a bucket)
   */
  function categoryKeyFromPath(pathname) {
    const path = String(pathname || '').split(/[?#]/)[0];
    const listing = path.match(/^\/products\/([^/]+)\/?$/i);
    if (listing) return normalizeCategorySlug(listing[1]);
    const menuProduct = path.match(/\/menu\/([^/]+)\/[^/]+\/?$/i);
    if (menuProduct) return normalizeCategorySlug(menuProduct[1]);
    return null;
  }

  /** Median of positive prices. Even counts use the mean of the two middle values. */
  function medianOfPrices(prices) {
    const nums = [];
    (Array.isArray(prices) ? prices : []).forEach((price) => {
      const n = positivePrice(price);
      if (n != null) nums.push(n);
    });
    if (!nums.length) return null;
    nums.sort((a, b) => a - b);
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) return nums[mid];
    return (nums[mid - 1] + nums[mid]) / 2;
  }

  /**
   * Group scraped { categoryKey, price, url? } into medians.
   * A category with fewer than MIN_CATEGORY_PRICE_SAMPLE prices is omitted.
   * Same url counts once. No category key → that row is ignored.
   */
  function summarizeCategoryPriceMedians(entries) {
    const groups = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const key = entry && entry.categoryKey ? String(entry.categoryKey) : '';
      const price = positivePrice(entry && entry.price);
      if (!key || price == null) return;
      const dedupe = entry.url ? String(entry.url) : `row:${index}`;
      if (!groups.has(key)) groups.set(key, new Map());
      groups.get(key).set(dedupe, price);
    });
    const medians = {};
    groups.forEach((priceMap, key) => {
      const prices = Array.from(priceMap.values());
      if (prices.length < MIN_CATEGORY_PRICE_SAMPLE) return;
      const median = medianOfPrices(prices);
      if (median == null) return;
      medians[key] = { median, sampleCount: prices.length };
    });
    return medians;
  }

  /**
   * Provenance the adapter payload actually carries. Missing parts stay absent.
   *
   * Sunnyside inventory (React fiber / API model) exposes source_sku and
   * mfg_date. It does not expose a lab name. mfg_date is a packaged date, not
   * a lab test. Relative created_ago / updated_ago and exp_date are not used.
   *
   * Zen Leaf labTests exposes potency only. displayThc.label is THC/THCA, not
   * a laboratory. Image sourceUrl and promo startDate/endDate are not used.
   * A lab name or testedAt is shown only when that key is on the payload.
   *
   * Retailer names are not a menu source or a lab. Never invent one.
   */
  const PROVENANCE_RETAILER = /^(sunnyside|zen\s*leaf|zenleaf|terravida(?:\s*\([^)]*\))?)$/i;
  const PROVENANCE_NOT_LAB = new Set([
    'thc',
    'thca',
    'cbd',
    'cbda',
    'cbn',
    'cbg',
    'cbc',
    'tac',
    'terp',
    'terps',
    'terpene',
    'terpenes',
    'total terpenes',
    'total terps'
  ]);
  const PROVENANCE_EMBED_KEYS = [
    'source_sku',
    'sourceSku',
    'menuSource',
    'labName',
    'lab_name',
    'laboratory',
    'laboratoryName',
    'testedAt',
    'tested_at',
    'testDate',
    'test_date',
    'labTestedAt',
    'lab_tested_at',
    'mfg_date',
    'mfgDate',
    'packagedAt',
    'packaged_at',
    'packageDate',
    'package_date'
  ];

  function cleanProvenanceToken(value, maxLen) {
    if (value == null || typeof value === 'boolean' || typeof value === 'object') return null;
    const s = String(value).replace(/\s+/g, ' ').trim();
    if (!s || s.length > maxLen) return null;
    if (/[<>]/.test(s) || /:\/\//.test(s)) return null;
    if (PROVENANCE_RETAILER.test(s)) return null;
    return s;
  }

  function parseProvenanceDate(value) {
    if (value == null || typeof value === 'boolean' || typeof value === 'object') return null;
    const s = String(value).trim();
    if (!s || /\bago\b/i.test(s)) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d.*)?$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y < 1990 || y > 2100) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function firstProvenanceDate(values) {
    for (const value of values) {
      const parsed = parseProvenanceDate(value);
      if (parsed) return parsed;
    }
    return null;
  }

  function labTestsOf(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.labTests && typeof obj.labTests === 'object') return obj.labTests;
    if (obj.lab_tests && typeof obj.lab_tests === 'object') return obj.lab_tests;
    return null;
  }

  function readLabLabelFrom(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const labTests = labTestsOf(obj);
    const nestedLab = labTests && labTests.lab && typeof labTests.lab === 'object' ? labTests.lab : null;
    const labObj = obj.lab && typeof obj.lab === 'object' ? obj.lab : null;
    const candidates = [
      obj.labName,
      obj.lab_name,
      obj.laboratory,
      obj.laboratoryName,
      labTests && labTests.labName,
      labTests && labTests.lab_name,
      labTests && labTests.laboratory,
      labTests && labTests.laboratoryName,
      nestedLab && nestedLab.name,
      !labTests && labObj && labObj.name
    ];
    for (const value of candidates) {
      const s = cleanProvenanceToken(value, 60);
      if (!s) continue;
      if (PROVENANCE_NOT_LAB.has(s.toLowerCase())) continue;
      return s;
    }
    return null;
  }

  function readProvenanceFields(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const source =
      cleanProvenanceToken(obj.source_sku, 80) ||
      cleanProvenanceToken(obj.sourceSku, 80) ||
      cleanProvenanceToken(obj.menuSource, 80);
    const lab = readLabLabelFrom(obj);
    const labTests = labTestsOf(obj);
    const tested = firstProvenanceDate([
      obj.testedAt,
      obj.tested_at,
      obj.testDate,
      obj.test_date,
      obj.labTestedAt,
      obj.lab_tested_at,
      labTests && labTests.testedAt,
      labTests && labTests.tested_at,
      labTests && labTests.testDate,
      labTests && labTests.test_date
    ]);
    const packaged = firstProvenanceDate([
      obj.mfg_date,
      obj.mfgDate,
      obj.packagedAt,
      obj.packaged_at,
      obj.packageDate,
      obj.package_date,
      labTests && labTests.mfg_date,
      labTests && labTests.mfgDate,
      labTests && labTests.packagedAt,
      labTests && labTests.packaged_at,
      labTests && labTests.packageDate
    ]);
    let timestamp = null;
    let timestampKind = null;
    if (tested) {
      timestamp = tested;
      timestampKind = 'tested';
    } else if (packaged) {
      timestamp = packaged;
      timestampKind = 'packaged';
    }
    if (!source && !lab && !timestamp) return null;
    const out = {};
    if (source) out.source = source;
    if (lab) out.lab = lab;
    if (timestamp) {
      out.timestamp = timestamp;
      out.timestampKind = timestampKind;
    }
    return out;
  }

  function isNormalizedProvenance(obj) {
    const keys = Object.keys(obj);
    if (!keys.length) return false;
    const allowed = new Set(['source', 'lab', 'timestamp', 'timestampKind']);
    return keys.every((key) => allowed.has(key));
  }

  function combineProvenance(left, right) {
    if (!left && !right) return null;
    const source = (left && left.source) || (right && right.source) || null;
    const lab = (left && left.lab) || (right && right.lab) || null;
    const leftTime = left && left.timestamp ? left : null;
    const rightTime = right && right.timestamp ? right : null;
    const chosen =
      (leftTime && leftTime.timestampKind === 'tested' && leftTime) ||
      (rightTime && rightTime.timestampKind === 'tested' && rightTime) ||
      leftTime ||
      rightTime ||
      null;
    if (!source && !lab && !(chosen && chosen.timestamp)) return null;
    const out = {};
    if (source) out.source = source;
    if (lab) out.lab = lab;
    if (chosen && chosen.timestamp) {
      out.timestamp = chosen.timestamp;
      if (chosen.timestampKind) out.timestampKind = chosen.timestampKind;
    }
    return out;
  }

  /**
   * Normalize a raw menu object, an embedded-field bag, or an already
   * normalized { source, lab, timestamp, timestampKind }. Null when nothing
   * real is present.
   */
  function readProvenance(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    if (isNormalizedProvenance(input)) {
      const bag = {};
      if (input.source) bag.source_sku = input.source;
      if (input.lab) bag.labName = input.lab;
      if (input.timestampKind === 'tested') bag.testedAt = input.timestamp;
      else if (input.timestampKind === 'packaged') bag.mfg_date = input.timestamp;
      else if (input.timestamp) bag.testedAt = input.timestamp;
      const normalized = readProvenanceFields(bag);
      if (normalized && input.timestamp && !input.timestampKind && normalized.timestampKind === 'tested') {
        delete normalized.timestampKind;
      }
      return normalized;
    }
    const own = readProvenanceFields(input);
    const nested =
      input.provenance && input.provenance !== input ? readProvenance(input.provenance) : null;
    return combineProvenance(own, nested);
  }

  function mergeProvenance(a, b) {
    return combineProvenance(readProvenance(a), readProvenance(b));
  }

  function readEmbeddedJsonString(html, key) {
    const src = String(html || '');
    const esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp('"' + esc + '"\\s*:\\s*"([^"\\\\]{1,160})"'),
      new RegExp('\\\\"' + esc + '\\\\"\\s*:\\s*\\\\"([^"\\\\]{1,160})\\\\"')
    ];
    for (const re of patterns) {
      const match = src.match(re);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  /** Pull only known provenance keys out of PDP HTML. No match → null. */
  function scrapeProvenanceFromHtml(html) {
    if (!html) return null;
    const bag = {};
    let found = false;
    PROVENANCE_EMBED_KEYS.forEach((key) => {
      const value = readEmbeddedJsonString(html, key);
      if (!value) return;
      bag[key] = value;
      found = true;
    });
    if (!found) return null;
    return readProvenanceFields(bag);
  }

  /**
   * Below-median flag. Null unless price, median, and sample size are all real
   * and the listed price is strictly under that median. Never invents a number.
   */
  function dealVsCategoryMedian(price, categoryMedian, sampleCount) {
    const p = positivePrice(price);
    const m = positivePrice(categoryMedian);
    const n = Number(sampleCount);
    if (p == null || m == null) return null;
    if (!Number.isFinite(n) || n < MIN_CATEGORY_PRICE_SAMPLE) return null;
    if (!(p < m)) return null;
    return { price: p, categoryMedian: m, sampleCount: n };
  }

  global.CSI = {
    VERSION,
    MAX_COMPARE,
    CACHE_TTL_MS,
    ACCENT_ORANGE,
    ACCENT_DARK,
    DEBUG,
    TERPENE_CANON,
    log,
    warn,
    error,
    escapeHtml,
    escapeRegExp,
    canonicalizeTerpeneName,
    parsePercent,
    parsePrice,
    hasCannabinoidInfo,
    hasTerpeneInfo,
    hasDetailedTerpeneBreakdown,
    extractTerpenesFromObject,
    normalizeTerpeneMap,
    totalTerpenes,
    topTerpene,
    readThcPercent,
    readThcaPercent,
    readListedThcDisplay,
    readListedThcPercent,
    buildProductUrl,
    extractProductData,
    scoreTasteMatch,
    SIMILAR_CHEM_MIN_SCORE,
    SIMILAR_CHEM_MAX_NEIGHBORS,
    SIMILAR_CHEM_THC_NEAR_PTS,
    namedTerpenePercents,
    chemSimilarityVector,
    cosineSimilarity,
    sharedNamedTerpenes,
    sameMenuHost,
    rankSimilarByChem,
    CROSS_STORE_MIN_SCORE,
    CROSS_STORE_MAX_MATCHES,
    CROSS_STORE_IDENTICAL_CHEM,
    CROSS_STORE_IDENTICAL_CANNABINOID_PTS,
    listedCannabinoidsAgree,
    adapterIdFromUrl,
    adapterDisplayName,
    normalizeProductName,
    nameSimilarity,
    productFormKey,
    buildPdpCacheRecord,
    listedDollarsPerMg,
    rankCrossStoreSoftMatch,
    dollarsPerMgThc,
    parseWeightGrams,
    detectSale,
    DEAL_MEDIAN_TTL_MS,
    MIN_CATEGORY_PRICE_SAMPLE,
    positivePrice,
    normalizeMenuUrl,
    normalizeCategorySlug,
    categoryKeyFromPath,
    medianOfPrices,
    summarizeCategoryPriceMedians,
    dealVsCategoryMedian,
    readProvenance,
    mergeProvenance,
    scrapeProvenanceFromHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

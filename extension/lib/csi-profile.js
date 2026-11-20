/**
 * Opt-in local taste profile (Free). Structured shopping prefs only.
 * Storage and network live in csi-storage.js — this file is schema + merge.
 *
 * Schema v2 (#73 PR A). v1 migrates once on load/import.
 * avoidEffects is stored and shown only — never used in scoring.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = 'csi_taste_profile';
  const MAX_BOUGHT = 200;
  const MAX_TOKENS = 30;
  const MAX_TOKEN_LEN = 48;
  const MAX_BUDGET = 2000;
  const MAX_IMPORT_BYTES = 64 * 1024;

  const FORMAT_IDS = Object.freeze([
    'flower',
    'vape',
    'vape-live-resin-rosin',
    'troche',
    'concentrate',
    'tincture-rso',
    'edible',
    'topical'
  ]);
  const FORMAT_SLOTS = Object.freeze(['day', 'night']);
  const SIZES = Object.freeze(['1g', '3.5g', '7g', '14g', '28g']);
  const RATIOS = Object.freeze(['thc-forward', 'balanced', 'cbd-forward', 'cbg-forward']);
  const POTENCY_BANDS = Object.freeze(['under-15', '15-25', '25-plus']);
  const FLAGS = Object.freeze(['rebuy', 'fine', 'never']);
  const DEAL_TIERS = Object.freeze(['any', 'sale', 'below-median']);
  const GOALS = Object.freeze([
    'sleep-time',
    'relaxation',
    'daytime-focus',
    'body-comfort',
    'mood-creative'
  ]);
  const TIME_OF_USE = Object.freeze(['daytime', 'evening', 'bedtime']);
  const THC_PREF = Object.freeze(['moderate', 'high', 'terps-first', 'low-thc-high-cbd']);
  const MINORS = Object.freeze(['cbd', 'cbn', 'cbg']);
  // Stored and shown only — never used in scoring (see applyToTasteMap / picks).
  const AVOID_EFFECTS = Object.freeze([
    'couch-lock',
    'racy',
    'brain-fog',
    'dry-mouth-munchies',
    'next-morning-grogginess'
  ]);
  const DAY_RATIO = Object.freeze([
    'cbd-20-1',
    'cbd-10-1',
    'cbd-4-1',
    'cbd-2-1',
    'balanced-1-1',
    'lowest-thc'
  ]);
  const FLOWER_METHOD = Object.freeze(['joint-preroll', 'pipe-bong', 'dry-herb-vape']);
  const VAPE_HARDWARE = Object.freeze(['cart-510', 'aio', 'prefer-rosin']);
  const STORE_IDS = Object.freeze([
    'sunnyside',
    'zenleaf',
    'terravida',
    'curaleaf',
    'iheartjane',
    'dutchie',
    'shopd'
  ]);
  const ALLOWED_KEYS = Object.freeze([
    'schemaVersion',
    'enabled',
    'updatedAt',
    'goals',
    'timeOfUse',
    'formats',
    'sizes',
    'cannabinoidRatio',
    'potencyBandThc',
    'thcPref',
    'likedTerpenes',
    'avoidTerpenes',
    'minors',
    'budget',
    'avoidEffects',
    'dayRatio',
    'flowerMethod',
    'vapeHardware',
    'strainLoves',
    'strainAvoids',
    'brandLoves',
    'brandAvoids',
    'familyLoves',
    'familyAvoids',
    'watchedStores',
    'dealTier',
    'dealsOnly',
    'boughtBefore'
  ]);
  /** v1-only keys accepted solely for migration (never written back). */
  const V1_MIGRATE_KEYS = Object.freeze([
    'forms',
    'tripBudgetUsd',
    'homeStore',
    'secondaryStores',
    'brandLoyal',
    'brandAvoid'
  ]);
  const BRAND_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&-]{0,47}$/;
  // Dutchie + Trulieve + Beyond Hello + Curaleaf: apex only after one-prefix www strip
  // (not *.host / www.www.*). Other partners keep subdomain allow.
  const HOST_OK =
    /(^|\.)sunnyside\.shop$|(^|\.)zenleafdispensaries\.com$|(^|\.)risecannabis\.com$|^beyond-hello\.com$|^dutchie\.com$|^trulieve\.com$|^curaleaf\.com$/i;
  /** Fallback when Dutchie adapter is not loaded (e.g. minimal smoke harness). */
  const DUTCHIE_VERIFIED_PRODUCT_RE =
    /^\/embedded-menu\/liberty-norristown\/product\/[^/]+\/?$/i;
  /** Fallback when shopd adapter is not loaded. */
  const SHOPD_PRODUCT_RE = /^\/shopd\/product\/[^/]+\/?$/i;
  /** Fallback when iHeartJane adapter is not loaded — Beyond Hello West Chester only. */
  const BH_VERIFIED_PRODUCT_RE =
    /^\/pennsylvania-dispensaries\/west-chester\/medical-menu\/menu\/products\/\d+\/[^/]+\/?$/i;
  /** Fallback when Curaleaf adapter is not loaded — KOP slug only. */
  const CURALEAF_VERIFIED_PRODUCT_RE =
    /^\/shop\/pennsylvania\/curaleaf-pa-king-of-prussia\/menu\/[^/]+\/[^/]+\/?$/i;

  const COPY = Object.freeze({
    title: 'Local taste profile',
    hint: 'Optional and Free. Stored on this device only. Nothing is saved until you turn it on. Turning off stops using the profile; Delete wipes it. Structured chem fields — not a notes field.',
    enable: 'Save a local taste profile',
    forms: 'Forms',
    formats: 'Formats',
    sizes: 'Package sizes',
    ratio: 'Cannabinoid ratio',
    potency: 'THC band',
    thcPref: 'THC preference',
    liked: 'Liked terpenes',
    avoid: 'Avoid terpenes',
    minors: 'Minor cannabinoids',
    budget: 'Trip budget (USD)',
    budgetMin: 'Budget min (USD)',
    budgetMax: 'Budget max (USD)',
    watched: 'Watched stores',
    home: 'Home store',
    secondary: 'Secondary stores',
    brandLoyal: 'Brands to keep',
    brandAvoid: 'Brands to skip',
    brandLoves: 'Brands to keep',
    brandAvoids: 'Brands to skip',
    strainLoves: 'Strains to keep',
    strainAvoids: 'Strains to skip',
    familyLoves: 'Strain families to keep',
    familyAvoids: 'Strain families to skip',
    goals: 'Shopping goals',
    timeOfUse: 'Time of use',
    dayRatio: 'Daytime CBD:THC ratio',
    flowerMethod: 'Flower method',
    vapeHardware: 'Vape hardware',
    // avoidEffects: stored and shown only — never used in scoring.
    avoidEffects: 'Skip list (shown only)',
    dealTier: 'Deal listing',
    dealsOnly: 'Deals only',
    export: 'Export JSON',
    import: 'Import JSON',
    importConfirm: 'Apply import',
    importCancel: 'Cancel import',
    del: 'Delete profile',
    save: 'Save profile',
    brandsEmpty: 'Browse a supported menu first to pick brands from listed products.',
    boughtTitle: 'Bought before',
    flagRebuy: 'Re-buy',
    flagFine: 'Fine',
    flagNever: 'Never again',
    goalLabels: {
      'sleep-time': 'Sleep-time shopping',
      relaxation: 'Relaxation shopping',
      'daytime-focus': 'Daytime focus',
      'body-comfort': 'Body comfort',
      'mood-creative': 'Creative sessions'
    },
    timeOfUseLabels: {
      daytime: 'Daytime',
      evening: 'Evening',
      bedtime: 'Bedtime'
    },
    thcPrefLabels: {
      moderate: 'Moderate THC',
      high: 'Higher THC',
      'terps-first': 'Terpenes first',
      'low-thc-high-cbd': 'Lower THC, higher CBD'
    },
    avoidEffectsLabels: {
      'couch-lock': 'Couch-lock',
      racy: 'Racy',
      'brain-fog': 'Brain fog',
      'dry-mouth-munchies': 'Dry mouth / munchies',
      'next-morning-grogginess': 'Next-morning grogginess'
    },
    dayRatioLabels: {
      'cbd-20-1': 'CBD 20:1',
      'cbd-10-1': 'CBD 10:1',
      'cbd-4-1': 'CBD 4:1',
      'cbd-2-1': 'CBD 2:1',
      'balanced-1-1': 'Balanced 1:1',
      'lowest-thc': 'Lowest THC'
    },
    flowerMethodLabels: {
      'joint-preroll': 'Joint / pre-roll',
      'pipe-bong': 'Pipe / bong',
      'dry-herb-vape': 'Dry-herb vape'
    },
    vapeHardwareLabels: {
      'cart-510': '510 cart',
      aio: 'All-in-one',
      'prefer-rosin': 'Prefer rosin'
    },
    formatLabels: {
      flower: 'Flower',
      vape: 'Vape',
      'vape-live-resin-rosin': 'Live resin / rosin vape',
      troche: 'Troche',
      concentrate: 'Concentrate',
      'tincture-rso': 'Tincture / RSO',
      edible: 'Edible',
      topical: 'Topical'
    },
    ratioLabels: {
      'thc-forward': 'THC-forward',
      balanced: 'Balanced',
      'cbd-forward': 'CBD-forward',
      'cbg-forward': 'CBG-forward'
    },
    potencyLabels: {
      'under-15': 'Under 15%',
      '15-25': '15–25%',
      '25-plus': '25%+'
    },
    dealLabels: {
      any: 'Any listed price',
      sale: 'Sale listed',
      'below-median': 'Below menu median'
    }
  });

  // Legacy alias used by older popup/smoke labels.
  const FORMS = FORMAT_IDS;

  function terpeneIds() {
    const list = Array.isArray(CSI.TERPENE_CANON) ? CSI.TERPENE_CANON : [];
    return list.map((e) => e && e.name).filter(Boolean);
  }

  function terpeneSet() {
    return new Set(terpeneIds());
  }

  function emptyEnabled() {
    return {
      schemaVersion: SCHEMA_VERSION,
      enabled: true,
      updatedAt: 0,
      goals: [],
      timeOfUse: [],
      formats: [],
      sizes: [],
      cannabinoidRatio: null,
      potencyBandThc: null,
      thcPref: null,
      likedTerpenes: [],
      avoidTerpenes: [],
      minors: [],
      budget: null,
      avoidEffects: [],
      dayRatio: null,
      flowerMethod: null,
      vapeHardware: null,
      strainLoves: [],
      strainAvoids: [],
      brandLoves: [],
      brandAvoids: [],
      familyLoves: [],
      familyAvoids: [],
      watchedStores: [],
      dealTier: 'any',
      dealsOnly: false,
      boughtBefore: {}
    };
  }

  function fail(message) {
    return { ok: false, error: message, value: null };
  }

  function uniqueIn(list, allowed) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      if (typeof raw !== 'string') return;
      const v = raw.trim();
      if (!allowed.has(v) || seen.has(v)) return;
      seen.add(v);
      out.push(v);
    });
    return out;
  }

  function uniqueEnum(list, allowedList) {
    return uniqueIn(list, new Set(allowedList));
  }

  function terpeneAliasMap() {
    const map = new Map();
    (Array.isArray(CSI.TERPENE_CANON) ? CSI.TERPENE_CANON : []).forEach((entry) => {
      if (!entry || !entry.name) return;
      const id = entry.name;
      map.set(id, id);
      map.set(id.toLowerCase(), id);
      (entry.keys || []).forEach((k) => {
        if (typeof k !== 'string' || !k.trim()) return;
        map.set(k.trim().toLowerCase(), id);
      });
    });
    return map;
  }

  /**
   * Profile import: exact canonical name or listed alias only.
   * Do not use substring matching (e.g. "contains limonene").
   */
  function exactTerpeneId(raw, known) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (known.has(trimmed)) return trimmed;
    const aliases = terpeneAliasMap();
    const lower = trimmed.toLowerCase();
    const id = aliases.get(trimmed) || aliases.get(lower);
    if (!id || !known.has(id)) return null;
    return id;
  }

  function canonTerpeneList(list, known) {
    if (list == null) return { values: [] };
    if (!Array.isArray(list)) return { error: 'terpene list must be an array' };
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      if (typeof raw !== 'string') return { error: 'terpene list must be strings' };
      if (!raw.trim()) continue;
      const name = exactTerpeneId(raw, known);
      if (!name) return { error: 'unknown terpene' };
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return { values: out };
  }

  function normalizeBrandLabel(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().replace(/\s+/g, ' ');
    if (s.length > MAX_TOKEN_LEN) return null;
    if (!BRAND_RE.test(s)) return null;
    return s;
  }

  function uniqueTokens(list, label) {
    if (list == null) return { ok: true, values: [] };
    if (!Array.isArray(list)) return fail(`${label} must be an array`);
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      if (typeof raw !== 'string') return fail(`${label} must be strings`);
      if (!raw.trim()) continue;
      const token = normalizeBrandLabel(raw);
      if (!token) return fail(`${label} tokens must match brand pattern (≤${MAX_TOKEN_LEN} chars)`);
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
    if (out.length > MAX_TOKENS) return fail(`too many ${label} (max ${MAX_TOKENS})`);
    return { ok: true, values: out };
  }

  function uniqueBrands(list) {
    return uniqueTokens(list, 'brands');
  }

  function productKeyFromUrl(url) {
    const norm =
      typeof CSI.normalizeMenuUrl === 'function' ? CSI.normalizeMenuUrl(url, '') : String(url || '').split(/[?#]/)[0];
    if (!norm) return null;
    let parsed;
    try {
      parsed = new URL(norm);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:') return null;
    const bareHost = parsed.hostname.replace(/^www\./i, '');
    if (!HOST_OK.test(bareHost) && !HOST_OK.test(parsed.hostname)) return null;
    if (parsed.username || parsed.password || parsed.hash) return null;
    // Dutchie: only verified Liberty embedded-menu product PDPs (adapter allowlist when present).
    if (/^dutchie\.com$/i.test(bareHost)) {
      if (CSI.adapters?.dutchie?.buildProductUrl) {
        const built = CSI.adapters.dutchie.buildProductUrl(parsed.href);
        if (!built) return null;
        return built.replace(/\/$/, '');
      }
      if (!DUTCHIE_VERIFIED_PRODUCT_RE.test(parsed.pathname)) return null;
    }
    // Trulieve shopd: only /shopd/product/… PDPs (adapter allowlist when present).
    if (/^trulieve\.com$/i.test(bareHost)) {
      if (CSI.adapters?.shopd?.buildProductUrl) {
        const built = CSI.adapters.shopd.buildProductUrl(parsed.href);
        if (!built) return null;
        return built.replace(/\/$/, '');
      }
      if (!SHOPD_PRODUCT_RE.test(parsed.pathname)) return null;
    }
    // Beyond Hello: only verified West Chester Jane Boost PDPs (adapter allowlist when present).
    // Canonicalize to apex https://beyond-hello.com so www/apex share bought-before keys.
    if (/^beyond-hello\.com$/i.test(bareHost)) {
      if (CSI.adapters?.iheartjane?.buildProductUrl) {
        const built = CSI.adapters.iheartjane.buildProductUrl(parsed.href);
        if (!built) return null;
        return built.replace(/\/$/, '');
      }
      if (!BH_VERIFIED_PRODUCT_RE.test(parsed.pathname)) return null;
      return `https://beyond-hello.com${parsed.pathname}`.replace(/\/$/, '');
    }
    // Curaleaf: only verified King of Prussia Sweed PDPs (adapter allowlist when present).
    if (/^curaleaf\.com$/i.test(bareHost)) {
      if (CSI.adapters?.curaleaf?.buildProductUrl) {
        const built = CSI.adapters.curaleaf.buildProductUrl(parsed.href);
        if (!built) return null;
        return built.replace(/\/$/, '');
      }
      if (!CURALEAF_VERIFIED_PRODUCT_RE.test(parsed.pathname)) return null;
      return `https://curaleaf.com${parsed.pathname}`.replace(/\/$/, '');
    }
    return parsed.href.replace(/\/$/, '');
  }

  function normalizeBought(map) {
    if (map == null) return { ok: true, value: {} };
    if (typeof map !== 'object' || Array.isArray(map)) return fail('boughtBefore must be an object');
    const out = {};
    const keys = Object.keys(map);
    if (keys.length > MAX_BOUGHT) return fail('too many bought-before flags');
    for (const k of keys) {
      const key = productKeyFromUrl(k);
      if (!key) return fail('boughtBefore key must be a supported product URL');
      const flag = map[k];
      if (!FLAGS.includes(flag)) return fail('boughtBefore flag must be rebuy, fine, or never');
      out[key] = flag;
    }
    return { ok: true, value: out };
  }

  function hasForbiddenText(obj) {
    return (
      'notes' in obj ||
      'note' in obj ||
      'mood' in obj ||
      'healthNotes' in obj ||
      'freeText' in obj
    );
  }

  function hasProfileFields(input) {
    if (!input || typeof input !== 'object') return false;
    return Object.keys(input).some((k) => k !== 'enabled' && k !== 'schemaVersion');
  }

  function isStoredProfile(value) {
    return !!(value && typeof value === 'object' && value.schemaVersion === SCHEMA_VERSION);
  }

  function looksLikeV1(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    if (input.schemaVersion === 1) return true;
    if (input.schemaVersion === SCHEMA_VERSION) return false;
    if (input.schemaVersion != null) return false;
    return V1_MIGRATE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(input, k));
  }

  function migrateFormatsFromForms(forms) {
    const out = [];
    const seen = new Set();
    (Array.isArray(forms) ? forms : []).forEach((raw) => {
      if (typeof raw !== 'string') return;
      const id = raw.trim();
      if (!FORMAT_IDS.includes(id) || seen.has(id)) return;
      seen.add(id);
      out.push({ id, slot: null });
    });
    return out;
  }

  /**
   * One-time idempotent v1 → v2 migration.
   * If v1 had no tripBudgetUsd, budget stays unset (never a default cap).
   * watchedStores = homeStore first, then secondaryStores, deduped, STORE_IDS only.
   */
  function migrateV1toV2(v1) {
    if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) {
      return fail('profile must be an object');
    }
    const base = emptyEnabled();
    base.enabled = v1.enabled === true;
    if (Number.isFinite(Number(v1.updatedAt))) base.updatedAt = Math.floor(Number(v1.updatedAt));

    if (Array.isArray(v1.formats)) {
      base.formats = v1.formats;
    } else {
      base.formats = migrateFormatsFromForms(v1.forms);
    }
    base.sizes = Array.isArray(v1.sizes) ? v1.sizes.slice() : [];
    base.cannabinoidRatio = v1.cannabinoidRatio || null;
    base.potencyBandThc = v1.potencyBandThc || null;
    base.likedTerpenes = Array.isArray(v1.likedTerpenes) ? v1.likedTerpenes.slice() : [];
    base.avoidTerpenes = Array.isArray(v1.avoidTerpenes) ? v1.avoidTerpenes.slice() : [];
    base.dealTier = v1.dealTier || 'any';
    base.boughtBefore =
      v1.boughtBefore && typeof v1.boughtBefore === 'object' && !Array.isArray(v1.boughtBefore)
        ? { ...v1.boughtBefore }
        : {};

    // Budget: only map when v1 had tripBudgetUsd. Never invent a default cap.
    if (v1.tripBudgetUsd != null) {
      base.budget = { min: null, max: Number(v1.tripBudgetUsd), currency: 'USD' };
    } else if (v1.budget != null) {
      base.budget = v1.budget;
    } else {
      base.budget = null;
    }

    // watchedStores: home first, then secondary, STORE_IDS only, deduped.
    if (Array.isArray(v1.watchedStores)) {
      base.watchedStores = v1.watchedStores.slice();
    } else {
      const watched = [];
      const seen = new Set();
      const pushStore = (id) => {
        if (typeof id !== 'string' || !STORE_IDS.includes(id) || seen.has(id)) return;
        seen.add(id);
        watched.push(id);
      };
      pushStore(v1.homeStore || null);
      (Array.isArray(v1.secondaryStores) ? v1.secondaryStores : []).forEach(pushStore);
      base.watchedStores = watched;
    }

    base.brandLoves = Array.isArray(v1.brandLoves)
      ? v1.brandLoves.slice()
      : Array.isArray(v1.brandLoyal)
        ? v1.brandLoyal.slice()
        : [];
    base.brandAvoids = Array.isArray(v1.brandAvoids)
      ? v1.brandAvoids.slice()
      : Array.isArray(v1.brandAvoid)
        ? v1.brandAvoid.slice()
        : [];

    // Pass through any v2 fields already present on a mixed payload.
    [
      'goals',
      'timeOfUse',
      'thcPref',
      'minors',
      'avoidEffects',
      'dayRatio',
      'flowerMethod',
      'vapeHardware',
      'strainLoves',
      'strainAvoids',
      'familyLoves',
      'familyAvoids',
      'dealsOnly'
    ].forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(v1, k)) base[k] = v1[k];
    });

    base.schemaVersion = SCHEMA_VERSION;
    return { ok: true, value: base, didMigrate: true };
  }

  function migrateIfNeeded(input) {
    if (input == null || input === false) return { ok: true, value: { enabled: false }, didMigrate: false };
    if (typeof input !== 'object' || Array.isArray(input)) return fail('profile must be an object');
    if (input.schemaVersion != null && input.schemaVersion > SCHEMA_VERSION) {
      return fail('unsupported schemaVersion');
    }
    if (looksLikeV1(input) || input.schemaVersion === 1) {
      return migrateV1toV2(input);
    }
    return { ok: true, value: input, didMigrate: false };
  }

  function strictEnumList(list, allowedList, label) {
    if (list == null) return { values: [] };
    if (!Array.isArray(list)) return { error: `${label} must be an array` };
    const allowed = new Set(allowedList);
    for (const raw of list) {
      if (typeof raw !== 'string' || !allowed.has(raw)) return { error: `unknown ${label}` };
    }
    return { values: uniqueEnum(list, allowedList) };
  }

  function normalizeFormats(list) {
    if (list == null) return { values: [] };
    if (!Array.isArray(list)) return { error: 'formats must be an array' };
    const out = [];
    const seen = new Set();
    for (const raw of list) {
      let id = null;
      let slot = null;
      if (typeof raw === 'string') {
        id = raw.trim();
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (typeof raw.id !== 'string') return { error: 'unknown format' };
        id = raw.id.trim();
        if (raw.slot != null) {
          if (typeof raw.slot !== 'string' || !FORMAT_SLOTS.includes(raw.slot)) {
            return { error: 'unknown format slot' };
          }
          slot = raw.slot;
        }
      } else {
        return { error: 'unknown format' };
      }
      if (!FORMAT_IDS.includes(id)) return { error: 'unknown format' };
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, slot });
    }
    return { values: out };
  }

  function normalizeBudget(raw) {
    if (raw == null) return { ok: true, value: null };
    if (typeof raw !== 'object' || Array.isArray(raw)) return fail('budget must be an object');
    const keys = Object.keys(raw);
    for (const k of keys) {
      if (k !== 'min' && k !== 'max' && k !== 'currency') return fail('unknown budget field');
    }
    let min = raw.min == null ? null : Number(raw.min);
    let max = raw.max == null ? null : Number(raw.max);
    const currency = raw.currency == null ? 'USD' : raw.currency;
    if (currency !== 'USD') return fail('budget currency must be USD');
    if (min != null && (!Number.isInteger(min) || min < 1 || min > MAX_BUDGET)) {
      return fail(`budget.min must be an integer 1–${MAX_BUDGET}`);
    }
    if (max != null && (!Number.isInteger(max) || max < 1 || max > MAX_BUDGET)) {
      return fail(`budget.max must be an integer 1–${MAX_BUDGET}`);
    }
    if (min != null && max != null && min > max) return fail('budget.min must be ≤ budget.max');
    if (min == null && max == null) return { ok: true, value: null };
    return { ok: true, value: { min, max, currency: 'USD' } };
  }

  function formatIds(profile) {
    if (!profile) return [];
    if (Array.isArray(profile.formats)) {
      return profile.formats
        .map((f) => (typeof f === 'string' ? f : f && f.id))
        .filter((id) => typeof id === 'string');
    }
    if (Array.isArray(profile.forms)) return profile.forms.slice();
    return [];
  }

  function budgetMax(profile) {
    if (!profile) return null;
    if (profile.budget && profile.budget.max != null) return profile.budget.max;
    if (profile.tripBudgetUsd != null) return profile.tripBudgetUsd;
    return null;
  }

  /**
   * Validate and normalize a profile payload.
   * Unknown fields, free-text notes, and unknown terpene/store ids fail closed.
   * enabled:false may retain full field data (opt-out without wipe).
   */
  function normalize(input, opts) {
    if (input == null || input === false) {
      return { ok: true, value: { enabled: false } };
    }
    if (typeof input !== 'object' || Array.isArray(input)) {
      return fail('profile must be an object');
    }

    if (input.schemaVersion != null && input.schemaVersion > SCHEMA_VERSION) {
      return fail('unsupported schemaVersion');
    }

    let working = input;
    let didMigrate = false;
    if (looksLikeV1(input) || input.schemaVersion === 1) {
      const migrated = migrateV1toV2(input);
      if (!migrated.ok) return migrated;
      working = migrated.value;
      didMigrate = true;
    }

    const keys = Object.keys(working);
    for (const k of keys) {
      if (!ALLOWED_KEYS.includes(k)) return fail(`unknown field: ${k}`);
    }
    if (hasForbiddenText(working)) return fail('free-text and health/mood fields are not allowed');

    if (working.enabled !== true && working.enabled !== false && working.enabled != null) {
      return fail('enabled must be boolean');
    }

    // Bare disable / empty load — no field payload.
    if (working.enabled !== true && !hasProfileFields(working)) {
      return { ok: true, value: { enabled: false } };
    }

    // Fields without an explicit boolean mean "not opted in" — reject rather than store.
    if (working.enabled == null) {
      return fail('profile is not enabled');
    }

    if (working.schemaVersion != null && working.schemaVersion !== SCHEMA_VERSION) {
      return fail('unsupported schemaVersion');
    }

    const formats = normalizeFormats(working.formats);
    if (formats.error) return fail(formats.error);
    const sizes = strictEnumList(working.sizes, SIZES, 'size');
    if (sizes.error) return fail(sizes.error);
    const goals = strictEnumList(working.goals, GOALS, 'goal');
    if (goals.error) return fail(goals.error);
    const timeOfUse = strictEnumList(working.timeOfUse, TIME_OF_USE, 'timeOfUse');
    if (timeOfUse.error) return fail(timeOfUse.error);
    const minors = strictEnumList(working.minors, MINORS, 'minor');
    if (minors.error) return fail(minors.error);
    // avoidEffects: stored and shown only — never used in scoring.
    const avoidEffects = strictEnumList(working.avoidEffects, AVOID_EFFECTS, 'avoidEffect');
    if (avoidEffects.error) return fail(avoidEffects.error);
    const watched = strictEnumList(working.watchedStores, STORE_IDS, 'watched store');
    if (watched.error) return fail(watched.error);

    const knownTerps = terpeneSet();
    const liked = canonTerpeneList(working.likedTerpenes, knownTerps);
    if (liked.error) return fail(liked.error);
    const avoid = canonTerpeneList(working.avoidTerpenes, knownTerps);
    if (avoid.error) return fail(avoid.error);
    const avoidSet = new Set(avoid.values);
    const likedTerpenes = liked.values.filter((t) => !avoidSet.has(t));

    if (working.cannabinoidRatio != null && !RATIOS.includes(working.cannabinoidRatio)) {
      return fail('unknown cannabinoidRatio');
    }
    if (working.potencyBandThc != null && !POTENCY_BANDS.includes(working.potencyBandThc)) {
      return fail('unknown potencyBandThc');
    }
    if (working.thcPref != null && !THC_PREF.includes(working.thcPref)) {
      return fail('unknown thcPref');
    }
    if (working.dayRatio != null && !DAY_RATIO.includes(working.dayRatio)) {
      return fail('unknown dayRatio');
    }
    if (working.flowerMethod != null && !FLOWER_METHOD.includes(working.flowerMethod)) {
      return fail('unknown flowerMethod');
    }
    if (working.vapeHardware != null && !VAPE_HARDWARE.includes(working.vapeHardware)) {
      return fail('unknown vapeHardware');
    }
    if (working.dealTier != null && !DEAL_TIERS.includes(working.dealTier)) {
      return fail('unknown dealTier');
    }
    if (working.dealsOnly != null && working.dealsOnly !== true && working.dealsOnly !== false) {
      return fail('dealsOnly must be boolean');
    }

    const budget = normalizeBudget(working.budget);
    if (!budget.ok) return budget;

    const strainLoves = uniqueTokens(working.strainLoves, 'strainLoves');
    if (!strainLoves.ok) return strainLoves;
    const strainAvoids = uniqueTokens(working.strainAvoids, 'strainAvoids');
    if (!strainAvoids.ok) return strainAvoids;
    const brandLoves = uniqueTokens(working.brandLoves, 'brandLoves');
    if (!brandLoves.ok) return brandLoves;
    const brandAvoids = uniqueTokens(working.brandAvoids, 'brandAvoids');
    if (!brandAvoids.ok) return brandAvoids;
    const familyLoves = uniqueTokens(working.familyLoves, 'familyLoves');
    if (!familyLoves.ok) return familyLoves;
    const familyAvoids = uniqueTokens(working.familyAvoids, 'familyAvoids');
    if (!familyAvoids.ok) return familyAvoids;

    // Reject raw entries that fail the pattern (uniqueTokens skips empty; reject bad non-empty).
    function rejectBadTokens(list, label) {
      if (!Array.isArray(list)) return null;
      for (const b of list) {
        if (typeof b === 'string' && b.trim() && !normalizeBrandLabel(b)) {
          return fail(`${label} tokens must match brand pattern (≤${MAX_TOKEN_LEN} chars)`);
        }
      }
      return null;
    }
    for (const [list, label] of [
      [working.strainLoves, 'strainLoves'],
      [working.strainAvoids, 'strainAvoids'],
      [working.brandLoves, 'brandLoves'],
      [working.brandAvoids, 'brandAvoids'],
      [working.familyLoves, 'familyLoves'],
      [working.familyAvoids, 'familyAvoids']
    ]) {
      const bad = rejectBadTokens(list, label);
      if (bad) return bad;
    }

    const bought = normalizeBought(working.boughtBefore);
    if (!bought.ok) return bought;

    let updatedAt = emptyEnabled().updatedAt;
    if (opts && Number.isFinite(opts.now)) updatedAt = Math.floor(opts.now);
    else if (Number.isFinite(Number(working.updatedAt))) updatedAt = Math.floor(Number(working.updatedAt));

    const value = {
      schemaVersion: SCHEMA_VERSION,
      enabled: working.enabled === true,
      updatedAt,
      goals: goals.values,
      timeOfUse: timeOfUse.values,
      formats: formats.values,
      sizes: sizes.values,
      cannabinoidRatio: working.cannabinoidRatio || null,
      potencyBandThc: working.potencyBandThc || null,
      thcPref: working.thcPref || null,
      likedTerpenes,
      avoidTerpenes: avoid.values,
      minors: minors.values,
      budget: budget.value,
      // avoidEffects: stored and shown only — never used in scoring.
      avoidEffects: avoidEffects.values,
      dayRatio: working.dayRatio || null,
      flowerMethod: working.flowerMethod || null,
      vapeHardware: working.vapeHardware || null,
      strainLoves: strainLoves.values,
      strainAvoids: strainAvoids.values,
      brandLoves: brandLoves.values,
      brandAvoids: brandAvoids.values,
      familyLoves: familyLoves.values,
      familyAvoids: familyAvoids.values,
      watchedStores: watched.values,
      dealTier: working.dealTier || 'any',
      dealsOnly: working.dealsOnly === true,
      boughtBefore: bought.value
    };
    return { ok: true, value, didMigrate };
  }

  function stableStringify(value) {
    return JSON.stringify(value);
  }

  function diffProfiles(current, next) {
    const changes = [];
    const cur = isStoredProfile(current) ? current : null;
    const nxt = next;
    if (!nxt || typeof nxt !== 'object') return { ok: false, error: 'nothing to diff', changes: [] };

    const keys = new Set([
      ...ALLOWED_KEYS.filter((k) => k !== 'updatedAt'),
      ...(cur ? Object.keys(cur) : [])
    ]);
    keys.forEach((k) => {
      if (k === 'updatedAt' || k === 'schemaVersion') return;
      const a = cur ? cur[k] : undefined;
      const b = nxt[k];
      if (stableStringify(a) === stableStringify(b)) return;
      changes.push({
        key: k,
        from: a === undefined ? null : a,
        to: b === undefined ? null : b
      });
    });
    if (!cur) {
      changes.unshift({ key: '_', from: null, to: 'new profile' });
    }
    return { ok: true, changes };
  }

  function formatDiffLines(diff) {
    if (!diff || !diff.ok) return [];
    return (diff.changes || []).map((c) => {
      if (c.key === '_') return 'Create a new local profile from this file.';
      return `${c.key}: ${stableStringify(c.from)} → ${stableStringify(c.to)}`;
    });
  }

  /**
   * Parse a local JSON export into a null-prototype object, enforce allowlist,
   * size cap, vocab, and schemaVersion ≤ 2 (migrate v1). Does not write storage.
   */
  function parseImportJson(text) {
    if (typeof text !== 'string') return fail('import must be a string');
    if (text.length > MAX_IMPORT_BYTES) return fail('import exceeds size cap');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail('invalid JSON');
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail('profile must be an object');
    }

    const clean = Object.create(null);
    for (const k of Object.keys(parsed)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        return fail('forbidden key');
      }
      const isAllowed = ALLOWED_KEYS.includes(k) || V1_MIGRATE_KEYS.includes(k);
      if (!isAllowed) return fail(`unknown field: ${k}`);
      clean[k] = parsed[k];
    }

    if (clean.schemaVersion != null && clean.schemaVersion > SCHEMA_VERSION) {
      return fail('unsupported schemaVersion');
    }

    const normalized = normalize(clean);
    if (!normalized.ok) return normalized;
    return { ok: true, value: normalized.value };
  }

  function exportJson(profile) {
    const parsed = normalize(profile, { now: profile && profile.updatedAt });
    if (!parsed.ok || !parsed.value || !isStoredProfile(parsed.value)) {
      return fail(parsed.error || 'nothing to export');
    }
    return { ok: true, json: JSON.stringify(parsed.value, null, 2), value: parsed.value };
  }

  function applyToTasteMap(tasteMap, profile) {
    if (!tasteMap || !profile || profile.enabled !== true) return tasteMap;
    const preferredTerpenes = { ...(tasteMap.preferredTerpenes || {}) };
    (profile.likedTerpenes || []).forEach((name) => {
      if (preferredTerpenes[name] == null) preferredTerpenes[name] = 0.75;
    });
    const avoid = new Set(
      (Array.isArray(tasteMap.avoidTerpenes) ? tasteMap.avoidTerpenes : []).map(
        (t) => CSI.canonicalizeTerpeneName(t) || t
      )
    );
    (profile.avoidTerpenes || []).forEach((name) => avoid.add(name));
    // avoidEffects is intentionally ignored here — stored/shown only, never scoring.
    return {
      ...tasteMap,
      preferredTerpenes,
      avoidTerpenes: Array.from(avoid)
    };
  }

  function brandsFromCacheEntries(entries) {
    const out = [];
    const seen = new Set();
    (Array.isArray(entries) ? entries : []).forEach((row) => {
      const brand = row && row.data && row.data.brand;
      const label = normalizeBrandLabel(String(brand || ''));
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
    return out.sort((a, b) => a.localeCompare(b));
  }

  function flagForProduct(profile, url) {
    if (!profile || profile.enabled !== true) return null;
    const key = productKeyFromUrl(url);
    if (!key) return null;
    return profile.boughtBefore && profile.boughtBefore[key] ? profile.boughtBefore[key] : null;
  }

  CSI.profile = {
    SCHEMA_VERSION,
    STORAGE_KEY,
    MAX_BUDGET,
    MAX_TOKENS,
    MAX_TOKEN_LEN,
    MAX_IMPORT_BYTES,
    FORMS,
    FORMAT_IDS,
    FORMAT_SLOTS,
    SIZES,
    RATIOS,
    POTENCY_BANDS,
    FLAGS,
    DEAL_TIERS,
    GOALS,
    TIME_OF_USE,
    THC_PREF,
    MINORS,
    AVOID_EFFECTS,
    DAY_RATIO,
    FLOWER_METHOD,
    VAPE_HARDWARE,
    STORE_IDS,
    ALLOWED_KEYS,
    COPY,
    terpeneIds,
    emptyEnabled,
    hasProfileFields,
    isStoredProfile,
    looksLikeV1,
    migrateIfNeeded,
    migrateV1toV2,
    normalize,
    formatIds,
    budgetMax,
    exportJson,
    parseImportJson,
    diffProfiles,
    formatDiffLines,
    applyToTasteMap,
    productKeyFromUrl,
    brandsFromCacheEntries,
    flagForProduct,
    normalizeBrandLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/**
 * Opt-in local taste profile (Free). Structured chem prefs only.
 * Storage and network live in csi-storage.js — this file is schema + merge.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'csi_taste_profile';
  const MAX_BOUGHT = 200;
  const MAX_BRANDS = 30;
  const MAX_BUDGET = 2000;

  const FORMS = Object.freeze(['flower', 'vape', 'concentrate', 'edible', 'topical']);
  const SIZES = Object.freeze(['1g', '3.5g', '7g', '14g', '28g']);
  const RATIOS = Object.freeze(['thc-forward', 'balanced', 'cbd-forward', 'cbg-forward']);
  const POTENCY_BANDS = Object.freeze(['under-15', '15-25', '25-plus']);
  const FLAGS = Object.freeze(['rebuy', 'fine', 'never']);
  const DEAL_TIERS = Object.freeze(['any', 'sale', 'below-median']);
  const STORE_IDS = Object.freeze(['sunnyside', 'zenleaf', 'terravida', 'iheartjane', 'dutchie']);
  const ALLOWED_KEYS = Object.freeze([
    'schemaVersion',
    'enabled',
    'updatedAt',
    'forms',
    'sizes',
    'cannabinoidRatio',
    'potencyBandThc',
    'likedTerpenes',
    'avoidTerpenes',
    'tripBudgetUsd',
    'homeStore',
    'secondaryStores',
    'brandLoyal',
    'brandAvoid',
    'dealTier',
    'boughtBefore'
  ]);
  const BRAND_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&-]{0,47}$/;
  const HOST_OK =
    /(^|\.)sunnyside\.shop$|(^|\.)zenleafdispensaries\.com$|(^|\.)risecannabis\.com$/i;

  const COPY = Object.freeze({
    title: 'Local taste profile',
    hint: 'Optional and Free. Stored on this device only. Nothing is saved until you turn it on. Turning off stops using the profile; Delete wipes it. Structured chem fields — not a notes field.',
    enable: 'Save a local taste profile',
    forms: 'Forms',
    sizes: 'Package sizes',
    ratio: 'Cannabinoid ratio',
    potency: 'THC band',
    liked: 'Liked terpenes',
    avoid: 'Avoid terpenes',
    budget: 'Per-trip budget (USD)',
    home: 'Home store',
    secondary: 'Secondary stores',
    brandLoyal: 'Brands to keep',
    brandAvoid: 'Brands to skip',
    dealTier: 'Deal listing',
    export: 'Export JSON',
    del: 'Delete profile',
    save: 'Save profile',
    brandsEmpty: 'Browse a supported menu first to pick brands from listed products.',
    boughtTitle: 'Bought before',
    flagRebuy: 'Re-buy',
    flagFine: 'Fine',
    flagNever: 'Never again',
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
      forms: [],
      sizes: [],
      cannabinoidRatio: null,
      potencyBandThc: null,
      likedTerpenes: [],
      avoidTerpenes: [],
      tripBudgetUsd: null,
      homeStore: null,
      secondaryStores: [],
      brandLoyal: [],
      brandAvoid: [],
      dealTier: 'any',
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
    if (!BRAND_RE.test(s)) return null;
    return s;
  }

  function uniqueBrands(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const label = normalizeBrandLabel(raw);
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    });
    if (out.length > MAX_BRANDS) return fail('too many brands');
    return { ok: true, values: out };
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
    if (!HOST_OK.test(parsed.hostname.replace(/^www\./i, '')) && !HOST_OK.test(parsed.hostname)) return null;
    if (parsed.username || parsed.password || parsed.hash) return null;
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
    const keys = Object.keys(input);
    for (const k of keys) {
      if (!ALLOWED_KEYS.includes(k)) return fail(`unknown field: ${k}`);
    }
    if (hasForbiddenText(input)) return fail('free-text and health/mood fields are not allowed');

    if (input.enabled !== true && input.enabled !== false && input.enabled != null) {
      return fail('enabled must be boolean');
    }

    // Bare disable / empty load — no field payload.
    if (input.enabled !== true && !hasProfileFields(input)) {
      return { ok: true, value: { enabled: false } };
    }

    // Fields without an explicit boolean mean "not opted in" — reject rather than store.
    if (input.enabled == null) {
      return fail('profile is not enabled');
    }

    if (input.schemaVersion != null && input.schemaVersion !== SCHEMA_VERSION) {
      return fail('unsupported schemaVersion');
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

    const forms = strictEnumList(input.forms, FORMS, 'form');
    if (forms.error) return fail(forms.error);
    const sizes = strictEnumList(input.sizes, SIZES, 'size');
    if (sizes.error) return fail(sizes.error);
    const secondary = strictEnumList(input.secondaryStores, STORE_IDS, 'secondary store');
    if (secondary.error) return fail(secondary.error);

    const knownTerps = terpeneSet();
    const liked = canonTerpeneList(input.likedTerpenes, knownTerps);
    if (liked.error) return fail(liked.error);
    const avoid = canonTerpeneList(input.avoidTerpenes, knownTerps);
    if (avoid.error) return fail(avoid.error);
    const avoidSet = new Set(avoid.values);
    const likedTerpenes = liked.values.filter((t) => !avoidSet.has(t));

    if (input.cannabinoidRatio != null && !RATIOS.includes(input.cannabinoidRatio)) {
      return fail('unknown cannabinoidRatio');
    }
    if (input.potencyBandThc != null && !POTENCY_BANDS.includes(input.potencyBandThc)) {
      return fail('unknown potencyBandThc');
    }
    if (input.dealTier != null && !DEAL_TIERS.includes(input.dealTier)) {
      return fail('unknown dealTier');
    }
    if (input.homeStore != null && !STORE_IDS.includes(input.homeStore)) {
      return fail('unknown homeStore');
    }
    if (input.tripBudgetUsd != null) {
      const n = Number(input.tripBudgetUsd);
      if (!Number.isInteger(n) || n < 1 || n > MAX_BUDGET) return fail('tripBudgetUsd must be an integer 1–2000');
    }

    const loyal = uniqueBrands(input.brandLoyal);
    if (!loyal.ok) return loyal;
    const skip = uniqueBrands(input.brandAvoid);
    if (!skip.ok) return skip;
    if (Array.isArray(input.brandLoyal) && input.brandLoyal.some((b) => typeof b === 'string' && b.trim() && !normalizeBrandLabel(b))) {
      return fail('brand labels must match listed-product brand pattern');
    }
    if (Array.isArray(input.brandAvoid) && input.brandAvoid.some((b) => typeof b === 'string' && b.trim() && !normalizeBrandLabel(b))) {
      return fail('brand labels must match listed-product brand pattern');
    }

    const bought = normalizeBought(input.boughtBefore);
    if (!bought.ok) return bought;

    let updatedAt = emptyEnabled().updatedAt;
    if (opts && Number.isFinite(opts.now)) updatedAt = Math.floor(opts.now);
    else if (Number.isFinite(Number(input.updatedAt))) updatedAt = Math.floor(Number(input.updatedAt));

    const secondaryStores = secondary.values.filter((id) => id !== (input.homeStore || null));

    const value = {
      schemaVersion: SCHEMA_VERSION,
      enabled: input.enabled === true,
      updatedAt,
      forms: forms.values,
      sizes: sizes.values,
      cannabinoidRatio: input.cannabinoidRatio || null,
      potencyBandThc: input.potencyBandThc || null,
      likedTerpenes,
      avoidTerpenes: avoid.values,
      tripBudgetUsd: input.tripBudgetUsd == null ? null : Number(input.tripBudgetUsd),
      homeStore: input.homeStore || null,
      secondaryStores,
      brandLoyal: loyal.values,
      brandAvoid: skip.values,
      dealTier: input.dealTier || 'any',
      boughtBefore: bought.value
    };
    return { ok: true, value };
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
    FORMS,
    SIZES,
    RATIOS,
    POTENCY_BANDS,
    FLAGS,
    DEAL_TIERS,
    STORE_IDS,
    COPY,
    terpeneIds,
    emptyEnabled,
    hasProfileFields,
    isStoredProfile,
    normalize,
    exportJson,
    applyToTasteMap,
    productKeyFromUrl,
    brandsFromCacheEntries,
    flagForProduct,
    normalizeBrandLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

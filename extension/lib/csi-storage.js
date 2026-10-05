/**
 * chrome.storage helpers for compare tray, taste map, filters, PDP cache.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const KEYS = {
    COMPARE: 'csi_compare',
    TASTE: 'csi_taste_map',
    PROFILE: 'csi_taste_profile',
    FILTERS: 'csi_listing_filters',
    CACHE_PREFIX: 'csi_pdp:',
    CATEGORY_MEDIANS: 'csi_category_medians',
    SOFT_UNLOCK_DISMISS: 'csi_soft_unlock_dismissed'
  };

  const DEFAULT_TASTE = {
    preferredTerpenes: {
      Limonene: 0.95,
      Terpinolene: 0.85,
      'Beta-Myrcene': 0.75,
      Linalool: 0.8,
      'Beta-Caryophyllene': 0.7,
      'Alpha-Pinene': 0.55,
      Humulene: 0.4,
      Ocimene: 0.35
    },
    avoidTerpenes: [],
    minMatchScore: 0.32,
    preferHighTotalTerps: true
  };

  const DEFAULT_FILTERS = {
    minThc: null,
    mustIncludeTerpene: '',
    excludeTerpene: '',
    maxDollarsPerMg: null,
    sortBy: 'default' // default | thca | totalTerps | matchScore
  };

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      } catch (e) {
        CSI.warn('storageGet failed', e);
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (e) {
        CSI.warn('storageSet failed', e);
        resolve();
      }
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(keys, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  async function loadCompare() {
    const data = await storageGet([KEYS.COMPARE]);
    const list = data[KEYS.COMPARE];
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, CSI.MAX_COMPARE)
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const url = String(p.url || '')
          .split(/[?#]/)[0]
          .replace(/\/$/, '');
        if (!url) return null;
        return { ...p, url };
      })
      .filter(Boolean);
  }

  async function saveCompare(list) {
    const cleaned = (list || [])
      .slice(0, CSI.MAX_COMPARE)
      .map((p) => ({
        ...p,
        url: String(p.url || '')
          .split(/[?#]/)[0]
          .replace(/\/$/, '')
      }))
      .filter((p) => p.url);
    await storageSet({ [KEYS.COMPARE]: cleaned });
  }

  async function clearCompare() {
    await storageRemove([KEYS.COMPARE]);
  }

  async function loadTasteMap() {
    const data = await storageGet([KEYS.TASTE]);
    const stored = data[KEYS.TASTE];
    if (stored && typeof stored === 'object') {
      // Saved prefs win, including an explicit empty preferred list, so
      // listing badges and the product panel can stay quiet. A saved map
      // with no preferredTerpenes object still uses the seeded defaults.
      const storedPrefs = stored.preferredTerpenes;
      const preferredTerpenes =
        storedPrefs && typeof storedPrefs === 'object' && !Array.isArray(storedPrefs)
          ? storedPrefs
          : { ...DEFAULT_TASTE.preferredTerpenes };
      return {
        ...DEFAULT_TASTE,
        ...stored,
        preferredTerpenes,
        avoidTerpenes: Array.isArray(stored.avoidTerpenes)
          ? stored.avoidTerpenes
          : DEFAULT_TASTE.avoidTerpenes
      };
    }
    // Try bundled default
    try {
      const url = chrome.runtime.getURL('data/default-taste-map.json');
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        return { ...DEFAULT_TASTE, ...json };
      }
    } catch (e) {
      CSI.log('default taste map fetch skipped', e);
    }
    return { ...DEFAULT_TASTE, preferredTerpenes: { ...DEFAULT_TASTE.preferredTerpenes } };
  }

  async function saveTasteMap(map) {
    await storageSet({ [KEYS.TASTE]: map });
  }

  async function loadFilters() {
    const data = await storageGet([KEYS.FILTERS]);
    return { ...DEFAULT_FILTERS, ...(data[KEYS.FILTERS] || {}) };
  }

  async function saveFilters(filters) {
    await storageSet({ [KEYS.FILTERS]: { ...DEFAULT_FILTERS, ...filters } });
  }

  function cacheKey(url) {
    return KEYS.CACHE_PREFIX + url;
  }

  async function getPdpCache(url) {
    if (!url) return null;
    const key = cacheKey(url);
    const data = await storageGet([key]);
    const entry = data[key];
    if (!entry || !entry.data || !entry.fetchedAt) return null;
    if (Date.now() - entry.fetchedAt > CSI.CACHE_TTL_MS) {
      await storageRemove([key]);
      return null;
    }
    return entry.data;
  }

  async function setPdpCache(url, productData, opts) {
    if (!url || !productData) return;
    const key = cacheKey(url);
    const merge = !!(opts && opts.merge);
    let fetchedAt = Date.now();
    let data = productData;
    if (merge) {
      const existing = await getPdpCache(url);
      if (existing) {
        const prev = await storageGet([key]);
        if (prev[key] && prev[key].fetchedAt) fetchedAt = prev[key].fetchedAt;
        const keepDetailedTerps =
          CSI.hasDetailedTerpeneBreakdown?.(existing.terpenes) &&
          !CSI.hasDetailedTerpeneBreakdown?.(productData.terpenes);
        data = {
          ...existing,
          ...productData,
          cannabinoids: {
            ...(existing.cannabinoids || {}),
            ...(productData.cannabinoids || {})
          },
          terpenes: keepDetailedTerps ? existing.terpenes : productData.terpenes ?? existing.terpenes,
          url: productData.url || existing.url,
          name: productData.name || existing.name
        };
      }
    }
    await storageSet({
      [key]: { data, fetchedAt }
    });
  }

  async function invalidatePdpCache(url) {
    if (!url) return;
    await storageRemove([cacheKey(url)]);
  }

  /** Drop expired cache entries (best-effort). */
  function normalizeHostName(host) {
    return String(host || '')
      .replace(/^www\./i, '')
      .toLowerCase();
  }

  function cacheEntryHostMatches(url, host) {
    if (!host) return true;
    if (typeof CSI.sameMenuHost === 'function') return CSI.sameMenuHost(url, host);
    try {
      const u = new URL(url);
      return normalizeHostName(u.hostname) === normalizeHostName(host);
    } catch {
      return false;
    }
  }

  /**
   * Already-fetched menu chem (TTL cache).
   * Does not scrape a new catalog — neighbors only come from prior listing/PDP loads.
   * Optional host / excludeAdapterId filters; omit host to include every cached store.
   */
  async function listPdpCache(opts) {
    const host = opts && opts.host;
    const excludeAdapterId = opts && opts.excludeAdapterId;
    try {
      const all = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
      const out = [];
      Object.entries(all || {}).forEach(([k, v]) => {
        if (!k.startsWith(KEYS.CACHE_PREFIX)) return;
        if (!v || !v.data || !v.fetchedAt) return;
        if (Date.now() - v.fetchedAt > CSI.CACHE_TTL_MS) return;
        const url = k.slice(KEYS.CACHE_PREFIX.length);
        if (host && !cacheEntryHostMatches(url, host)) return;
        const adapterId =
          (v.data && v.data.adapterId) ||
          (typeof CSI.adapterIdFromUrl === 'function' ? CSI.adapterIdFromUrl(url) : null);
        if (excludeAdapterId && adapterId === excludeAdapterId) return;
        out.push({ url, data: v.data, fetchedAt: v.fetchedAt, adapterId: adapterId || null });
      });
      return out;
    } catch (e) {
      CSI.log('listPdpCache skipped', e);
      return [];
    }
  }

  async function pruneExpiredCache() {
    try {
      const all = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
      const toRemove = [];
      Object.entries(all || {}).forEach(([k, v]) => {
        if (!k.startsWith(KEYS.CACHE_PREFIX)) return;
        if (!v || !v.fetchedAt || Date.now() - v.fetchedAt > CSI.CACHE_TTL_MS) toRemove.push(k);
      });
      if (toRemove.length) await storageRemove(toRemove);
    } catch (e) {
      CSI.log('prune skipped', e);
    }
  }

  /**
   * Menu medians computed from scraped listing prices.
   * Same host merges categories; a category seen again replaces its previous median.
   * Expired or other-host snapshots are not returned (other-host is left in place).
   */
  async function loadCategoryMedians(host) {
    const data = await storageGet([KEYS.CATEGORY_MEDIANS]);
    const snap = data[KEYS.CATEGORY_MEDIANS];
    if (!snap || typeof snap !== 'object') return null;
    if (host && normalizeHostName(snap.host) !== normalizeHostName(host)) return null;
    const ttl = CSI.DEAL_MEDIAN_TTL_MS || 0;
    if (!snap.savedAt || Date.now() - snap.savedAt > ttl) {
      await storageRemove([KEYS.CATEGORY_MEDIANS]);
      return null;
    }
    return snap;
  }

  async function saveCategoryMedians(snapshot) {
    if (!snapshot || !snapshot.host) return;
    const existing = await loadCategoryMedians(snapshot.host);
    const categories = { ...(existing && existing.categories ? existing.categories : {}) };
    const replaceKeys = Array.isArray(snapshot.replaceKeys) ? snapshot.replaceKeys : [];
    replaceKeys.forEach((key) => {
      if (key) delete categories[key];
    });
    const incoming = snapshot.categories && typeof snapshot.categories === 'object' ? snapshot.categories : {};
    Object.entries(incoming).forEach(([key, stats]) => {
      const median = CSI.positivePrice(stats && stats.median);
      const sampleCount = Number(stats && stats.sampleCount);
      if (!key || median == null) return;
      if (!Number.isFinite(sampleCount) || sampleCount < CSI.MIN_CATEGORY_PRICE_SAMPLE) return;
      categories[key] = { median, sampleCount };
    });

    const byUrl = new Map();
    (existing && Array.isArray(existing.products) ? existing.products : []).forEach((row) => {
      if (row && row.url && row.categoryKey) byUrl.set(row.url, { url: row.url, categoryKey: row.categoryKey });
    });
    (Array.isArray(snapshot.products) ? snapshot.products : []).forEach((row) => {
      if (!row || !row.url || !row.categoryKey) return;
      byUrl.set(String(row.url), { url: String(row.url), categoryKey: String(row.categoryKey) });
    });
    const products = Array.from(byUrl.values()).slice(-400);

    await storageSet({
      [KEYS.CATEGORY_MEDIANS]: {
        host: snapshot.host,
        adapterId: snapshot.adapterId || '',
        savedAt: Date.now(),
        categories,
        products
      }
    });
  }

  async function loadSoftUnlockDismissed() {
    const data = await storageGet([KEYS.SOFT_UNLOCK_DISMISS]);
    return data[KEYS.SOFT_UNLOCK_DISMISS] === true;
  }

  async function saveSoftUnlockDismissed() {
    await storageSet({ [KEYS.SOFT_UNLOCK_DISMISS]: true });
  }

  async function loadTasteProfile() {
    const data = await storageGet([KEYS.PROFILE]);
    const parsed = CSI.profile?.normalize?.(data[KEYS.PROFILE]);
    if (!parsed || !parsed.ok || !parsed.value) {
      return { enabled: false };
    }
    // Return full stored profiles even when disabled so the popup can reload fields.
    if (CSI.profile.isStoredProfile(parsed.value)) return parsed.value;
    return { enabled: false };
  }

  async function saveTasteProfile(raw) {
    const now = Date.now();
    const parsed = CSI.profile?.normalize?.(raw, { now });
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || 'invalid profile' };
    }

    // Opt-in write: first save must be enabled.
    if (parsed.value && parsed.value.enabled === true) {
      await storageSet({ [KEYS.PROFILE]: parsed.value });
      return { ok: true, value: parsed.value };
    }

    // Disable path: keep key + fields with enabled:false. Only Delete removes the key.
    const existingData = await storageGet([KEYS.PROFILE]);
    const existing = CSI.profile?.normalize?.(existingData[KEYS.PROFILE]);
    const hadStored =
      existing && existing.ok && CSI.profile.isStoredProfile(existing.value);

    if (CSI.profile.isStoredProfile(parsed.value)) {
      // Full disabled payload — write only if a profile already exists (nothing until opt-in).
      if (!hadStored) {
        return { ok: true, value: { enabled: false } };
      }
      await storageSet({ [KEYS.PROFILE]: parsed.value });
      return { ok: true, value: parsed.value };
    }

    // Bare { enabled: false }: flip the stored record off without wiping fields.
    if (hadStored) {
      const disabled = { ...existing.value, enabled: false, updatedAt: now };
      await storageSet({ [KEYS.PROFILE]: disabled });
      return { ok: true, value: disabled };
    }

    return { ok: true, value: { enabled: false } };
  }

  async function deleteTasteProfile() {
    await storageRemove([KEYS.PROFILE]);
    return { ok: true, value: { enabled: false } };
  }

  async function exportTasteProfile() {
    const profile = await loadTasteProfile();
    return CSI.profile?.exportJson?.(profile) || { ok: false, error: 'profile module missing' };
  }

  let boughtBeforeWrite = Promise.resolve();

  async function setBoughtBeforeFlag(url, flag) {
    const run = boughtBeforeWrite.then(() => setBoughtBeforeFlagUnlocked(url, flag));
    boughtBeforeWrite = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function setBoughtBeforeFlagUnlocked(url, flag) {
    const profile = await loadTasteProfile();
    if (!profile.enabled) return { ok: false, error: 'profile is not enabled' };
    const key = CSI.profile.productKeyFromUrl(url);
    if (!key) return { ok: false, error: 'unsupported product URL' };
    const nextFlag = (profile.boughtBefore || {})[key] === flag ? null : flag;
    const boughtBefore = { ...(profile.boughtBefore || {}) };
    if (!nextFlag) delete boughtBefore[key];
    else boughtBefore[key] = nextFlag;
    return saveTasteProfile({ ...profile, boughtBefore });
  }

  CSI.storage = {
    KEYS,
    DEFAULT_TASTE,
    DEFAULT_FILTERS,
    loadCompare,
    saveCompare,
    clearCompare,
    loadTasteMap,
    saveTasteMap,
    loadFilters,
    saveFilters,
    getPdpCache,
    setPdpCache,
    invalidatePdpCache,
    pruneExpiredCache,
    listPdpCache,
    loadCategoryMedians,
    saveCategoryMedians,
    loadSoftUnlockDismissed,
    saveSoftUnlockDismissed,
    loadTasteProfile,
    saveTasteProfile,
    deleteTasteProfile,
    exportTasteProfile,
    setBoughtBeforeFlag
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

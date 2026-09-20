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
    FILTERS: 'csi_listing_filters',
    CACHE_PREFIX: 'csi_pdp:',
    CATEGORY_MEDIANS: 'csi_category_medians'
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

  async function setPdpCache(url, productData) {
    if (!url || !productData) return;
    const key = cacheKey(url);
    await storageSet({
      [key]: { data: productData, fetchedAt: Date.now() }
    });
  }

  async function invalidatePdpCache(url) {
    if (!url) return;
    await storageRemove([cacheKey(url)]);
  }

  /** Drop expired cache entries (best-effort). */
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
    if (host && snap.host !== host) return null;
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
    loadCategoryMedians,
    saveCategoryMedians
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

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
    CACHE_PREFIX: 'csi_pdp:'
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
    return Array.isArray(list) ? list.slice(0, CSI.MAX_COMPARE) : [];
  }

  async function saveCompare(list) {
    await storageSet({ [KEYS.COMPARE]: (list || []).slice(0, CSI.MAX_COMPARE) });
  }

  async function clearCompare() {
    await storageRemove([KEYS.COMPARE]);
  }

  async function loadTasteMap() {
    const data = await storageGet([KEYS.TASTE]);
    if (data[KEYS.TASTE] && typeof data[KEYS.TASTE] === 'object') {
      return { ...DEFAULT_TASTE, ...data[KEYS.TASTE], preferredTerpenes: { ...DEFAULT_TASTE.preferredTerpenes, ...(data[KEYS.TASTE].preferredTerpenes || {}) } };
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
    pruneExpiredCache
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

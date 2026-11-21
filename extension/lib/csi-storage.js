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
    SOFT_UNLOCK_DISMISS: 'csi_soft_unlock_dismissed',
    SAVED_WATCH: 'csi_saved_watch'
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

  /** Rejects on chrome.runtime.lastError so callers can tell read failure from a missing key. */
  function storageGetStrict(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (result) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            CSI.warn('storageGetStrict failed', err);
            reject(new Error(err.message || 'storage read failed'));
            return;
          }
          resolve(result || {});
        });
      } catch (e) {
        CSI.warn('storageGetStrict failed', e);
        reject(e);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj, () => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            CSI.warn('storageSet failed', err);
            reject(new Error(err.message || 'storage write failed'));
            return;
          }
          resolve();
        });
      } catch (e) {
        CSI.warn('storageSet failed', e);
        reject(e);
      }
    });
  }

  /** Cache / prefs writes: log and continue so UI never stalls on quota/context errors. */
  async function storageSetBestEffort(obj) {
    try {
      await storageSet(obj);
    } catch (e) {
      CSI.warn('storageSet best-effort failed', e);
    }
  }

  /** Cache cleanup: ignore remove failures so callers never stall. */
  function storageRemove(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(keys, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  /** Profile delete: surface chrome.runtime.lastError / throw so callers can retry. */
  function storageRemoveStrict(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove(keys, () => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) {
            CSI.warn('storageRemoveStrict failed', err);
            reject(new Error(err.message || 'storage remove failed'));
            return;
          }
          resolve();
        });
      } catch (e) {
        CSI.warn('storageRemoveStrict failed', e);
        reject(e);
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
    await storageSetBestEffort({ [KEYS.COMPARE]: cleaned });
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
    // Try bundled default (via SW — no page-origin WAR required)
    try {
      const json = await CSI.fetchPackagedJson('data/default-taste-map.json');
      return { ...DEFAULT_TASTE, ...json };
    } catch (e) {
      CSI.log('default taste map fetch skipped', e);
    }
    return { ...DEFAULT_TASTE, preferredTerpenes: { ...DEFAULT_TASTE.preferredTerpenes } };
  }

  async function saveTasteMap(map) {
    await storageSetBestEffort({ [KEYS.TASTE]: map });
  }

  async function loadFilters() {
    const data = await storageGet([KEYS.FILTERS]);
    return { ...DEFAULT_FILTERS, ...(data[KEYS.FILTERS] || {}) };
  }

  async function saveFilters(filters) {
    await storageSetBestEffort({ [KEYS.FILTERS]: { ...DEFAULT_FILTERS, ...filters } });
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
    await storageSetBestEffort({
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
   * Menu medians from scraped listing prices, one chrome.storage.local key per host
   * (`csi_category_medians:<normalizedHost>`). Distinct keys so two menu tabs saving
   * different stores cannot clobber each other. The legacy shared key
   * `csi_category_medians` (flat snapshot or `{ byHost }`) still migrates on read.
   * Same host merges categories; a category seen again replaces its previous median.
   * Expired host keys are dropped; other hosts stay.
   */
  function categoryMediansKey(host) {
    return KEYS.CATEGORY_MEDIANS + ':' + host;
  }

  function isLegacyMedianSnap(raw) {
    return !!(
      raw &&
      typeof raw === 'object' &&
      !raw.byHost &&
      typeof raw.host === 'string' &&
      raw.categories &&
      typeof raw.categories === 'object'
    );
  }

  function readMedianStore(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    if (raw.byHost && typeof raw.byHost === 'object') {
      Object.entries(raw.byHost).forEach(([k, snap]) => {
        if (!snap || typeof snap !== 'object') return;
        const host = normalizeHostName(snap.host || k);
        if (!host) return;
        out[host] = { ...snap, host };
      });
      return out;
    }
    if (isLegacyMedianSnap(raw)) {
      const host = normalizeHostName(raw.host);
      if (host) out[host] = { ...raw, host };
    }
    return out;
  }

  function hostMedianSnap(raw, key) {
    if (raw && typeof raw === 'object' && raw.categories && typeof raw.categories === 'object') {
      return { ...raw, host: key };
    }
    return null;
  }

  async function loadCategoryMedians(host) {
    const key = normalizeHostName(host);
    if (!key) return null;
    const hostKey = categoryMediansKey(key);
    const data = await storageGet([hostKey, KEYS.CATEGORY_MEDIANS]);
    const fromHostKey = hostMedianSnap(data[hostKey], key);
    const fromLegacy = readMedianStore(data[KEYS.CATEGORY_MEDIANS])[key] || null;
    // Prefer the per-host key once present so an expired write is not resurrected
    // from a leftover shared blob.
    const snap = fromHostKey || fromLegacy;
    if (!snap) return null;
    const ttl = CSI.DEAL_MEDIAN_TTL_MS || 0;
    if (!snap.savedAt || Date.now() - snap.savedAt > ttl) {
      await storageRemove([hostKey]);
      return null;
    }
    // Host key is www-insensitive; keep snap.host normalized for callers.
    if (normalizeHostName(snap.host) !== key) return null;
    if (!fromHostKey) {
      await storageSetBestEffort({ [hostKey]: { ...snap, host: key } });
    }
    return { ...snap, host: key };
  }

  async function saveCategoryMedians(snapshot) {
    if (!snapshot || !snapshot.host) return;
    const host = normalizeHostName(snapshot.host);
    if (!host) return;
    const hostKey = categoryMediansKey(host);

    const data = await storageGet([hostKey, KEYS.CATEGORY_MEDIANS]);
    const existing =
      hostMedianSnap(data[hostKey], host) || readMedianStore(data[KEYS.CATEGORY_MEDIANS])[host] || null;
    const ttl = CSI.DEAL_MEDIAN_TTL_MS || 0;
    const existingFresh =
      existing &&
      existing.savedAt &&
      Date.now() - existing.savedAt <= ttl
        ? existing
        : null;

    const categories = {
      ...(existingFresh && existingFresh.categories ? existingFresh.categories : {})
    };
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
    (existingFresh && Array.isArray(existingFresh.products) ? existingFresh.products : []).forEach(
      (row) => {
        if (row && row.url && row.categoryKey) {
          byUrl.set(row.url, { url: row.url, categoryKey: row.categoryKey });
        }
      }
    );
    (Array.isArray(snapshot.products) ? snapshot.products : []).forEach((row) => {
      if (!row || !row.url || !row.categoryKey) return;
      byUrl.set(String(row.url), { url: String(row.url), categoryKey: String(row.categoryKey) });
    });
    const products = Array.from(byUrl.values()).slice(-400);

    await storageSetBestEffort({
      [hostKey]: {
        host,
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
    await storageSetBestEffort({ [KEYS.SOFT_UNLOCK_DISMISS]: true });
  }

  function normalizeStoredOrOff(raw) {
    const parsed = CSI.profile?.normalize?.(raw);
    if (!parsed || !parsed.ok || !parsed.value) return { enabled: false };
    if (CSI.profile.isStoredProfile(parsed.value)) return parsed.value;
    return { enabled: false };
  }

  /**
   * In-memory materialize (migrate without write). Shared by peek / strict Save read.
   */
  function materializeTasteProfile(raw) {
    if (raw == null) return { enabled: false };

    const migrated = CSI.profile?.migrateIfNeeded?.(raw);
    if (migrated && migrated.ok && migrated.didMigrate && migrated.value) {
      const normalizedMigrated = CSI.profile.normalize(migrated.value);
      if (normalizedMigrated && normalizedMigrated.ok && CSI.profile.isStoredProfile(normalizedMigrated.value)) {
        return normalizedMigrated.value;
      }
    }
    return normalizeStoredOrOff(raw);
  }

  /**
   * Strict read-only profile load (no migrate write-back). A chrome.storage
   * failure rejects so callers never treat a failed read as an empty profile
   * (which would show import "create" instead of "replace", or seed a Save wipe).
   */
  async function loadTasteProfileStrict() {
    const data = await storageGetStrict([KEYS.PROFILE]);
    return materializeTasteProfile(data[KEYS.PROFILE]);
  }

  /**
   * Read profile without write-back. Same strict semantics as
   * loadTasteProfileStrict — used for import preview / Apply so a failed read
   * cannot look like empty storage.
   */
  async function peekTasteProfile() {
    return loadTasteProfileStrict();
  }

  /**
   * Content scripts and the popup each have their own JS heap. Taste-profile
   * mutations go through the service worker so a listing bought-before flag
   * cannot race a popup import/save. Tests and the worker itself run the queue
   * locally (no runtime.id, or this is the worker).
   */
  function tasteProfileUsesLocalQueue() {
    if (typeof ServiceWorkerGlobalScope !== 'undefined') return true;
    try {
      return !chrome.runtime?.id;
    } catch {
      return true;
    }
  }

  function proxyTasteProfile(op, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'CSI_TASTE_PROFILE', op, payload: payload || {} },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err || !response) {
              resolve({ ok: false, error: (err && err.message) || 'profile update failed' });
              return;
            }
            resolve(response);
          }
        );
      } catch (e) {
        resolve({ ok: false, error: (e && e.message) || 'profile update failed' });
      }
    });
  }

  /**
   * Serialize taste-profile read/compare/write so import stale checks cannot
   * race other profile writers (save / delete / bought-before) in this JS heap.
   * Cross-context writers use proxyTasteProfile → service worker instead.
   */
  let tasteProfileWrite = Promise.resolve();

  function enqueueTasteProfile(mutator) {
    const run = tasteProfileWrite.then(() => mutator());
    tasteProfileWrite = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /**
   * One-time v1→v2 write-back on the shared writer (SW when cross-context).
   * Recheck before write so a concurrent Delete wins; read/write failures keep
   * the in-memory v2 return value (load must not abort).
   */
  async function migrateTasteProfileWrite(normalizedValue) {
    if (!tasteProfileUsesLocalQueue()) {
      const result = await proxyTasteProfile('migrateWrite', { value: normalizedValue });
      if (!result || result.ok === false) {
        CSI.warn('profile migration write failed', result && result.error);
        return { ok: true, value: normalizedValue };
      }
      return result;
    }
    return enqueueTasteProfile(() => migrateTasteProfileWriteUnlocked(normalizedValue));
  }

  async function migrateTasteProfileWriteUnlocked(payloadValue) {
    // Re-validate at write time: proxied migrateWrite must not skip normalize /
    // isStoredProfile the way save/import enforce on every mutation.
    if (payloadValue == null || typeof payloadValue !== 'object' || Array.isArray(payloadValue)) {
      return { ok: false, error: 'invalid migration payload' };
    }
    const normalized = CSI.profile?.normalize?.(payloadValue);
    if (!normalized || !normalized.ok || !CSI.profile.isStoredProfile(normalized.value)) {
      return {
        ok: false,
        error: (normalized && normalized.error) || 'invalid migration profile'
      };
    }
    const normalizedValue = normalized.value;
    try {
      const again = await storageGetStrict([KEYS.PROFILE]);
      const current = again[KEYS.PROFILE];
      // Delete (or never-stored) wins: do not resurrect the key.
      if (current == null) return { ok: true, value: { enabled: false } };
      const remig = CSI.profile.migrateIfNeeded(current);
      if (remig && remig.ok && !remig.didMigrate) {
        return { ok: true, value: normalizeStoredOrOff(current) };
      }
      try {
        await storageSet({ [KEYS.PROFILE]: normalizedValue });
      } catch (writeErr) {
        CSI.warn('profile migration write failed', writeErr);
      }
      return { ok: true, value: normalizedValue };
    } catch (readErr) {
      CSI.warn('profile migration recheck read failed', readErr);
      return { ok: true, value: normalizedValue };
    }
  }

  async function loadTasteProfile() {
    const data = await storageGet([KEYS.PROFILE]);
    const raw = data[KEYS.PROFILE];
    if (raw == null) return { enabled: false };

    // One-time idempotent v1 → v2 migration; write back only when shape changes.
    const migrated = CSI.profile?.migrateIfNeeded?.(raw);
    if (migrated && migrated.ok && migrated.didMigrate && migrated.value) {
      const normalizedMigrated = CSI.profile.normalize(migrated.value);
      if (normalizedMigrated && normalizedMigrated.ok && CSI.profile.isStoredProfile(normalizedMigrated.value)) {
        const result = await migrateTasteProfileWrite(normalizedMigrated.value);
        return (result && result.value) || normalizedMigrated.value;
      }
    }

    return normalizeStoredOrOff(raw);
  }

  async function saveTasteProfile(raw) {
    if (!tasteProfileUsesLocalQueue()) return proxyTasteProfile('save', { raw });
    return enqueueTasteProfile(() => saveTasteProfileUnlocked(raw));
  }

  async function saveTasteProfileUnlocked(raw) {
    const now = Date.now();
    // Capture the caller's basis rev before normalize. Missing → oldest (0).
    // updatedAt is display metadata only; merge order uses monotonic rev.
    const incomingBasisRev = CSI.profile.profileRev(raw);
    const parsed = CSI.profile?.normalize?.(raw, { now });
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || 'invalid profile' };
    }

    /**
     * Merge boughtBefore at commit time so a concurrent listing flag written
     * after the popup's Save read is not wiped when this Save commits.
     *
     * Newer-wins on monotonic profile.rev (not wall-clock updatedAt):
     * - If stored.rev > incoming basis rev → use stored.boughtBefore
     *   (a writer committed after the Save basis; keep those flags).
     * - Otherwise (equal, or missing basis = 0/oldest) → use incoming.boughtBefore
     *   (this queued mutation's map, e.g. setBoughtBeforeFlag after a same-queue peek).
     * - No stored profile → use incoming.
     */
    function mergeBoughtBefore(storedProfile, incomingProfile) {
      const incomingBB =
        incomingProfile &&
        incomingProfile.boughtBefore &&
        typeof incomingProfile.boughtBefore === 'object' &&
        !Array.isArray(incomingProfile.boughtBefore)
          ? { ...incomingProfile.boughtBefore }
          : {};
      if (!storedProfile || !CSI.profile.isStoredProfile(storedProfile)) return incomingBB;
      const storedRev = CSI.profile.profileRev(storedProfile);
      if (storedRev > incomingBasisRev) {
        const storedBB = storedProfile.boughtBefore;
        return storedBB && typeof storedBB === 'object' && !Array.isArray(storedBB)
          ? { ...storedBB }
          : {};
      }
      return incomingBB;
    }

    function nextProfileRev(storedProfile, incomingProfile) {
      // See CSI.profile.nextRev: ignore absurd incoming; never exceed REV_HARD_CAP.
      return CSI.profile.nextRev(
        CSI.profile.profileRev(storedProfile),
        CSI.profile.profileRev(incomingProfile)
      );
    }

    try {
      // Strict read for every full write: distinguish missing key from read failure,
      // and obtain a fresh boughtBefore basis for the merge below.
      let existingData;
      try {
        existingData = await storageGetStrict([KEYS.PROFILE]);
      } catch (readErr) {
        return { ok: false, error: (readErr && readErr.message) || 'storage read failed' };
      }
      const existing = CSI.profile?.normalize?.(existingData[KEYS.PROFILE]);
      const hadStored =
        existing && existing.ok && CSI.profile.isStoredProfile(existing.value);
      const storedProfile = hadStored ? existing.value : null;

      // Opt-in write: first save must be enabled.
      if (parsed.value && parsed.value.enabled === true) {
        const toWrite = {
          ...parsed.value,
          boughtBefore: mergeBoughtBefore(storedProfile, parsed.value),
          rev: nextProfileRev(storedProfile, parsed.value)
        };
        await storageSet({ [KEYS.PROFILE]: toWrite });
        return { ok: true, value: toWrite };
      }

      // Disable path: keep key + fields with enabled:false. Only Delete removes the key.
      if (CSI.profile.isStoredProfile(parsed.value)) {
        // Full disabled payload — write only if a profile already exists (nothing until opt-in).
        if (!hadStored) {
          return { ok: true, value: { enabled: false } };
        }
        const toWrite = {
          ...parsed.value,
          boughtBefore: mergeBoughtBefore(storedProfile, parsed.value),
          rev: nextProfileRev(storedProfile, parsed.value)
        };
        await storageSet({ [KEYS.PROFILE]: toWrite });
        return { ok: true, value: toWrite };
      }

      // Bare { enabled: false }: flip the stored record off without wiping fields.
      if (hadStored) {
        const disabled = {
          ...existing.value,
          enabled: false,
          updatedAt: now,
          rev: nextProfileRev(storedProfile, existing.value)
        };
        await storageSet({ [KEYS.PROFILE]: disabled });
        return { ok: true, value: disabled };
      }

      return { ok: true, value: { enabled: false } };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'storage write failed' };
    }
  }

  async function deleteTasteProfile() {
    if (!tasteProfileUsesLocalQueue()) return proxyTasteProfile('delete');
    return enqueueTasteProfile(async () => {
      try {
        await storageRemoveStrict([KEYS.PROFILE]);
        return { ok: true, value: { enabled: false } };
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'storage remove failed' };
      }
    });
  }

  async function exportTasteProfile() {
    const profile = await loadTasteProfile();
    return CSI.profile?.exportJson?.(profile) || { ok: false, error: 'profile module missing' };
  }

  /**
   * Preview a local JSON import (no write). Caller must confirm, then importTasteProfile.
   */
  async function previewTasteProfileImport(text) {
    const parsed = CSI.profile?.parseImportJson?.(text);
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || 'invalid import' };
    }
    // Strict read-only: a failed get must not look like empty → "create" preview.
    let current;
    try {
      current = await peekTasteProfile();
    } catch (readErr) {
      return {
        ok: false,
        error: (readErr && readErr.message) || 'storage read failed'
      };
    }
    let diff = CSI.profile.diffProfiles(current, parsed.value);
    // Flag forged/huge incoming rev in the confirm UI (no numeric leak / no host DOM).
    if (CSI.profile.annotateAbnormalRev) {
      diff = CSI.profile.annotateAbnormalRev(diff, current, parsed.value);
    }
    return {
      ok: true,
      value: parsed.value,
      currentRev: CSI.profile.isStoredProfile(current) ? CSI.profile.profileRev(current) : null,
      // updatedAt remains display metadata on the profile; not used for stale checks.
      currentUpdatedAt: CSI.profile.isStoredProfile(current) ? current.updatedAt : null,
      diff,
      lines: CSI.profile.formatDiffLines(diff)
    };
  }

  /**
   * Confirmed local import: write a full stored profile even when enabled:false
   * and even when no key exists yet (restore after Delete / off export).
   * When opts.expectedRev is set, re-reads storage immediately before writing
   * and aborts if stored.rev > preview basis rev (concurrent commit).
   * Stale recheck + write run on the shared profile queue so concurrent saves
   * cannot slip between the compare and the write in this JS heap.
   */
  async function importTasteProfile(raw, opts) {
    const now = Date.now();
    const parsed = CSI.profile?.normalize?.(raw, { now });
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || 'invalid import' };
    }
    if (!CSI.profile.isStoredProfile(parsed.value)) {
      return { ok: false, error: 'import must be a full profile' };
    }
    if (!tasteProfileUsesLocalQueue()) {
      return proxyTasteProfile('import', { raw: parsed.value, opts: opts || {} });
    }
    const expectRev =
      opts && Object.prototype.hasOwnProperty.call(opts, 'expectedRev')
        ? opts.expectedRev
        : undefined;
    return enqueueTasteProfile(async () => {
      try {
        // Strict read once: stale-check (when requested) + rev floor for the write.
        let again;
        try {
          again = await storageGetStrict([KEYS.PROFILE]);
        } catch (readErr) {
          return {
            ok: false,
            error: (readErr && readErr.message) || 'storage read failed'
          };
        }
        const rawLatest = again[KEYS.PROFILE];
        let storedRev = 0;
        if (rawLatest != null) {
          const migrated = CSI.profile?.migrateIfNeeded?.(rawLatest);
          let latest;
          if (migrated && migrated.ok && migrated.didMigrate && migrated.value) {
            const normalizedMigrated = CSI.profile.normalize(migrated.value);
            latest =
              normalizedMigrated &&
              normalizedMigrated.ok &&
              CSI.profile.isStoredProfile(normalizedMigrated.value)
                ? normalizedMigrated.value
                : normalizeStoredOrOff(rawLatest);
          } else {
            latest = normalizeStoredOrOff(rawLatest);
          }
          if (CSI.profile.isStoredProfile(latest)) {
            storedRev = CSI.profile.profileRev(latest);
          }
        }
        // Missing preview basis → oldest (0). Stale when stored advanced past basis.
        if (expectRev !== undefined) {
          const basisRev = expectRev == null ? 0 : CSI.profile.coerceRev(expectRev).value;
          if (storedRev > basisRev) {
            return { ok: false, error: 'profile changed, re-run import', stale: true };
          }
        }
        // Never let rev go backward; ignore absurd incoming (see CSI.profile.nextRev).
        const incomingRev = CSI.profile.profileRev(parsed.value);
        const toWrite = {
          ...parsed.value,
          rev: CSI.profile.nextRev(storedRev, incomingRev)
        };
        await storageSet({ [KEYS.PROFILE]: toWrite });
        return { ok: true, value: toWrite };
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'storage write failed' };
      }
    });
  }

  async function setBoughtBeforeFlag(url, flag) {
    if (!tasteProfileUsesLocalQueue()) return proxyTasteProfile('boughtBefore', { url, flag });
    return enqueueTasteProfile(() => setBoughtBeforeFlagUnlocked(url, flag));
  }

  async function setBoughtBeforeFlagUnlocked(url, flag) {
    // Peek (no migrate write) — already on the writer queue; nested migrate enqueue
    // would deadlock. Saving the flag persists any in-memory v1→v2 materialization.
    let profile;
    try {
      profile = await peekTasteProfile();
    } catch (readErr) {
      return { ok: false, error: (readErr && readErr.message) || 'storage read failed' };
    }
    if (!profile.enabled) return { ok: false, error: 'profile is not enabled' };
    const key = CSI.profile.productKeyFromUrl(url);
    if (!key) return { ok: false, error: 'unsupported product URL' };
    const nextFlag = (profile.boughtBefore || {})[key] === flag ? null : flag;
    const boughtBefore = { ...(profile.boughtBefore || {}) };
    if (!nextFlag) delete boughtBefore[key];
    else boughtBefore[key] = nextFlag;
    return saveTasteProfileUnlocked({ ...profile, boughtBefore });
  }

  let savedWatchWrite = Promise.resolve();

  /**
   * Content scripts and the popup each have their own JS heap. Saved-watch
   * writes go through the service worker so two tabs cannot clobber one blob.
   * Tests and the worker itself run the queue locally (no runtime.id, or this
   * is the worker).
   */
  function savedWatchUsesLocalQueue() {
    if (typeof ServiceWorkerGlobalScope !== 'undefined') return true;
    try {
      return !chrome.runtime?.id;
    } catch {
      return true;
    }
  }

  function proxySavedWatch(op, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'CSI_SAVED_WATCH', op, payload: payload || {} }, (response) => {
          const err = chrome.runtime.lastError;
          if (err || !response) {
            resolve({ ok: false, error: (err && err.message) || 'watch update failed' });
            return;
          }
          resolve(response);
        });
      } catch (e) {
        resolve({ ok: false, error: (e && e.message) || 'watch update failed' });
      }
    });
  }

  function enqueueSavedWatch(mutator) {
    const run = savedWatchWrite.then(mutator, mutator);
    savedWatchWrite = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function loadSavedWatch() {
    const data = await storageGet([KEYS.SAVED_WATCH]);
    return CSI.digest?.normalizeWatch?.(data[KEYS.SAVED_WATCH]) || { items: [], byUrl: {}, lastIssuedAt: null, issued: null };
  }

  async function writeSavedWatch(watch) {
    const normalized = CSI.digest?.normalizeWatch?.(watch) || watch;
    await storageSet({ [KEYS.SAVED_WATCH]: normalized });
    return normalized;
  }

  async function loadSavedItems() {
    const watch = await loadSavedWatch();
    return watch.items || [];
  }

  function savedAdapterId(url, explicit) {
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().slice(0, 32);
    return CSI.adapterIdFromUrl?.(url) || '';
  }

  async function toggleSavedItem(raw) {
    if (!savedWatchUsesLocalQueue()) return proxySavedWatch('toggle', raw);
    return enqueueSavedWatch(async () => {
      const url = CSI.digest?.allowlistedUrl?.(raw && raw.url) || '';
      if (!url) return { ok: false, error: 'unsupported product URL', saved: false, items: [] };
      const watch = await loadSavedWatch();
      const existing = (watch.items || []).findIndex((item) => item.url === url);
      if (existing > -1) {
        const items = watch.items.slice();
        items.splice(existing, 1);
        const byUrl = { ...(watch.byUrl || {}) };
        delete byUrl[url];
        const next = await writeSavedWatch({ ...watch, items, byUrl });
        return { ok: true, saved: false, items: next.items };
      }
      if ((watch.items || []).length >= (CSI.digest?.MAX_SAVED || 40)) {
        return { ok: false, error: 'list full', saved: false, items: watch.items };
      }
      const items = (watch.items || []).concat([
        {
          url,
          name: CSI.digest?.cleanName?.(raw && raw.name) || CSI.digest?.COPY?.productFallback || 'Saved product',
          adapterId: savedAdapterId(url, raw && raw.adapterId),
          savedAt: Date.now()
        }
      ]);
      const byUrl = { ...(watch.byUrl || {}) };
      if (raw && raw.observation) {
        byUrl[url] = CSI.digest.applyObservation(null, raw.observation);
      }
      const next = await writeSavedWatch({ ...watch, items, byUrl });
      return { ok: true, saved: true, items: next.items };
    });
  }

  async function removeSavedItem(url) {
    if (!savedWatchUsesLocalQueue()) return proxySavedWatch('remove', { url });
    return enqueueSavedWatch(async () => {
      const canonical = CSI.digest?.allowlistedUrl?.(url) || '';
      const watch = await loadSavedWatch();
      if (!canonical) return { ok: false, error: 'unsupported product URL', saved: false, items: watch.items || [] };
      if (!(watch.items || []).some((item) => item.url === canonical)) {
        return { ok: true, saved: false, items: watch.items || [] };
      }
      const items = watch.items.filter((item) => item.url !== canonical);
      const byUrl = { ...(watch.byUrl || {}) };
      delete byUrl[canonical];
      const next = await writeSavedWatch({ ...watch, items, byUrl });
      return { ok: true, saved: false, items: next.items };
    });
  }

  async function recordSavedObservation(url, observation) {
    if (!savedWatchUsesLocalQueue()) return proxySavedWatch('record', { url, observation });
    return enqueueSavedWatch(async () => {
      const canonical = CSI.digest?.allowlistedUrl?.(url) || '';
      if (!canonical || !CSI.digest?.applyObservation) return { ok: false, recorded: false };
      const watch = await loadSavedWatch();
      const saved = (watch.items || []).find((item) => item.url === canonical);
      if (!saved) return { ok: false, recorded: false };
      const prev = watch.byUrl && watch.byUrl[canonical];
      if (prev && CSI.digest.sameCommercialObservation(prev, observation)) {
        return { ok: true, recorded: false, items: watch.items };
      }
      const byUrl = { ...(watch.byUrl || {}) };
      byUrl[canonical] = CSI.digest.applyObservation(prev, observation);
      const items = (watch.items || []).map((item) => {
        if (item.url !== canonical) return item;
        const name = CSI.digest.cleanName(observation && observation.name);
        return name ? { ...item, name } : item;
      });
      await writeSavedWatch({ ...watch, items, byUrl });
      return { ok: true, recorded: true, items };
    });
  }

  async function commitSavedDigest(now, opts) {
    const isProFlag =
      opts && typeof opts.isPro === 'boolean'
        ? opts.isPro
        : !!(CSI.features && CSI.features.can && CSI.features.can(CSI.digest.FEATURE_ID));
    if (!savedWatchUsesLocalQueue()) {
      return proxySavedWatch('commit', { now: now || Date.now(), isPro: isProFlag });
    }
    return enqueueSavedWatch(async () => {
      const watch = await loadSavedWatch();
      if (!CSI.digest?.evaluate) return { view: { status: 'empty', items: [] }, watch };
      const isPro = isProFlag;
      const result = CSI.digest.evaluate({
        savedItems: watch.items,
        digest: watch,
        now: now || Date.now(),
        isPro,
        commit: true
      });
      if (!result.persist) return { view: result.view, watch };
      const next = await writeSavedWatch({
        ...watch,
        ...result.digest,
        items: watch.items
      });
      return { view: result.view, watch: next };
    });
  }

  async function previewSavedDigest(now) {
    const watch = await loadSavedWatch();
    if (!CSI.digest?.evaluate) return { status: 'empty', items: [] };
    const isPro = !!(CSI.features && CSI.features.can && CSI.features.can(CSI.digest.FEATURE_ID));
    return CSI.digest.evaluate({
      savedItems: watch.items,
      digest: watch,
      now: now || Date.now(),
      isPro,
      commit: false
    }).view;
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
    loadTasteProfileStrict,
    peekTasteProfile,
    saveTasteProfile,
    deleteTasteProfile,
    exportTasteProfile,
    previewTasteProfileImport,
    importTasteProfile,
    setBoughtBeforeFlag,
    migrateTasteProfileWrite,
    loadSavedWatch,
    loadSavedItems,
    toggleSavedItem,
    removeSavedItem,
    recordSavedObservation,
    commitSavedDigest,
    previewSavedDigest
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/**
 * Entitlement — license activate/validate against CannabisSage web API.
 * No card collection in the extension; upgrade deep-links to Stripe Checkout on the site.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  const STORAGE_KEY = 'csi_entitlement';
  const CONFIG_URL = 'data/config.json';

  let cachedConfig = null;
  let cachedEntitlement = null;

  async function loadConfig() {
    if (cachedConfig) return cachedConfig;
    try {
      const url = chrome.runtime.getURL(CONFIG_URL);
      const res = await fetch(url);
      cachedConfig = res.ok ? await res.json() : {};
    } catch {
      cachedConfig = {};
    }
    // Local/dev override: chrome.storage.local.csi_api_base = 'http://localhost:3000'
    // (or edit data/config.json when loading unpacked). Production default is cannabissage.vercel.app.
    try {
      const local = await chrome.storage.local.get(['csi_api_base']);
      if (local.csi_api_base) cachedConfig.apiBaseUrl = local.csi_api_base;
    } catch {
      /* ignore */
    }
    cachedConfig.apiBaseUrl = (
      cachedConfig.apiBaseUrl || 'https://cannabissage.vercel.app'
    ).replace(/\/$/, '');
    cachedConfig.upgradeUrl = cachedConfig.upgradeUrl || `${cachedConfig.apiBaseUrl}/#pricing`;
    cachedConfig.accountUrl = cachedConfig.accountUrl || `${cachedConfig.apiBaseUrl}/account`;
    return cachedConfig;
  }

  async function readStored() {
    if (cachedEntitlement) return cachedEntitlement;
    try {
      const data = await chrome.storage.local.get([STORAGE_KEY]);
      cachedEntitlement = data[STORAGE_KEY] || null;
    } catch {
      cachedEntitlement = null;
    }
    return cachedEntitlement;
  }

  async function writeStored(entitlement) {
    cachedEntitlement = entitlement;
    await chrome.storage.local.set({ [STORAGE_KEY]: entitlement });
  }

  async function clearStored() {
    cachedEntitlement = null;
    await chrome.storage.local.remove([STORAGE_KEY]);
  }

  function isProFromRecord(rec, now = Date.now()) {
    if (!rec || !rec.active) return false;
    if (rec.expiresAt) {
      const t = Date.parse(rec.expiresAt);
      if (!Number.isNaN(t) && t < now) return false;
    }
    return true;
  }

  function isPro() {
    return isProFromRecord(cachedEntitlement);
  }

  async function refreshIsPro() {
    await readStored();
    return isPro();
  }

  async function activate(licenseKey) {
    const config = await loadConfig();
    const key = String(licenseKey || '')
      .trim()
      .toUpperCase();
    const res = await fetch(`${config.apiBaseUrl}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ licenseKey: key })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.active) {
      throw new Error(data.error || 'Activation failed');
    }
    const entitlement = {
      active: true,
      licenseKey: data.licenseKey || key,
      email: data.email || null,
      expiresAt: data.expiresAt || null,
      status: data.status || 'active',
      plan: data.plan || 'pro',
      activatedAt: new Date().toISOString()
    };
    await writeStored(entitlement);
    return entitlement;
  }

  async function validateRemote() {
    const rec = await readStored();
    if (!rec?.licenseKey) return null;
    const config = await loadConfig();
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ licenseKey: rec.licenseKey })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.active) {
        await writeStored({
          ...rec,
          active: false,
          status: data.status || 'inactive',
          expiresAt: data.expiresAt || rec.expiresAt
        });
        return cachedEntitlement;
      }
      await writeStored({
        ...rec,
        active: true,
        status: data.status || 'active',
        expiresAt: data.expiresAt || rec.expiresAt,
        email: data.email || rec.email
      });
      return cachedEntitlement;
    } catch (e) {
      CSI.warn?.('entitlement validate failed; using cache', e);
      return rec;
    }
  }

  async function openUpgrade() {
    const config = await loadConfig();
    chrome.tabs?.create?.({ url: config.upgradeUrl }) || window.open(config.upgradeUrl, '_blank');
  }

  async function openManage() {
    const config = await loadConfig();
    const rec = await readStored();
    // Prefer site account page (portal needs server session with license)
    const url = rec?.licenseKey
      ? `${config.accountUrl}?key=${encodeURIComponent(rec.licenseKey)}`
      : config.accountUrl;
    chrome.tabs?.create?.({ url }) || window.open(url, '_blank');
  }

  // Warm cache
  readStored().catch(() => {});

  CSI.entitlement = {
    STORAGE_KEY,
    loadConfig,
    readStored,
    writeStored,
    clearStored,
    isPro,
    refreshIsPro,
    activate,
    validateRemote,
    openUpgrade,
    openManage
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/**
 * Built-in store adapter registry.
 * Order matters: more specific adapters (e.g. TerraVida/Malvern) before general ones.
 * Community adapters: add an in-repo file + push onto BUILTIN_ORDER — no remote loaders.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  /** @type {string[]} */
  const BUILTIN_ORDER = ['terravida', 'zenleaf', 'sunnyside'];

  function listAdapters() {
    return BUILTIN_ORDER.map((id) => CSI.adapters?.[id]).filter(Boolean);
  }

  function getAdapterById(id) {
    return CSI.adapters?.[id] || null;
  }

  function resolveAdapter(urlLike) {
    const href = urlLike || (typeof location !== 'undefined' ? location.href : '');
    for (const id of BUILTIN_ORDER) {
      const adapter = CSI.adapters?.[id];
      if (!adapter) continue;
      try {
        if (adapter.matchesUrl(href)) return adapter;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function getActiveAdapter() {
    if (CSI._activeAdapter) return CSI._activeAdapter;
    const adapter = resolveAdapter(typeof location !== 'undefined' ? location.href : '');
    CSI._activeAdapter = adapter;
    return adapter;
  }

  function setActiveAdapter(adapter) {
    CSI._activeAdapter = adapter || null;
    return CSI._activeAdapter;
  }

  function refreshActiveAdapter() {
    CSI._activeAdapter = resolveAdapter(typeof location !== 'undefined' ? location.href : '');
    return CSI._activeAdapter;
  }

  /** Collect unique chrome match patterns / hosts for manifest docs. */
  function collectHostPermissions() {
    const hosts = new Set();
    listAdapters().forEach((a) => {
      (a.matchPatterns || []).forEach((p) => hosts.add(p));
    });
    return [...hosts];
  }

  CSI.registry = {
    BUILTIN_ORDER,
    listAdapters,
    getAdapterById,
    resolveAdapter,
    getActiveAdapter,
    setActiveAdapter,
    refreshActiveAdapter,
    collectHostPermissions
  };

  // Resolve immediately when running in a page
  if (typeof location !== 'undefined') {
    refreshActiveAdapter();
    if (CSI._activeAdapter) {
      CSI.log?.(`active adapter: ${CSI._activeAdapter.id} (${CSI._activeAdapter.displayName})`);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

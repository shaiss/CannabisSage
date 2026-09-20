/**
 * Route router — SPA-aware listing ↔ PDP switching via active store adapter.
 */
(function () {
  'use strict';
  const CSI = globalThis.CSI;
  if (!CSI) return;

  let mode = null; // 'listing' | 'pdp' | null
  let lastPathSeen = '';

  function currentMode() {
    const adapter = CSI.registry?.refreshActiveAdapter?.() || CSI.registry?.getActiveAdapter?.();
    if (!adapter) return null;
    return adapter.routeMode(location.pathname) || null;
  }

  function cleanupSharedChrome() {
    document.getElementById('csi-filter-bar')?.remove();
  }

  function syncRoute(force) {
    const path = location.pathname;
    const next = currentMode();
    if (!force && path === lastPathSeen && next === mode) {
      CSI.routes?.onSameRoute?.(next);
      return;
    }
    lastPathSeen = path;
    CSI.log('route sync', mode, '->', next, path, CSI.registry?.getActiveAdapter?.()?.id);
    const prev = mode;
    mode = next;

    if (prev === 'listing' && next !== 'listing') {
      CSI.routes?.teardownListing?.();
      cleanupSharedChrome();
    }
    if (prev === 'pdp' && next !== 'pdp') {
      CSI.routes?.teardownPdp?.();
    }

    if (next === 'listing') CSI.routes?.startListing?.();
    if (next === 'pdp') {
      setTimeout(() => CSI.routes?.startPdp?.(), 200);
    }
  }

  function boot() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'cannabis-sage-bridge' || data.direction !== 'route') return;
      syncRoute(true);
    });
    window.addEventListener('popstate', () => syncRoute(true));
    setInterval(() => syncRoute(false), 400);
    setTimeout(() => syncRoute(true), 0);
  }

  CSI.routes = CSI.routes || {};
  CSI.router = { syncRoute, currentMode };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

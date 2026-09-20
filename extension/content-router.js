/**
 * Route router — one content-script injection covers SPA nav between
 * /products/* and /product/* without requiring a full document reload.
 */
(function () {
  'use strict';
  const CSI = globalThis.CSI;
  if (!CSI) return;

  let mode = null; // 'listing' | 'pdp' | null

  function currentMode() {
    const path = location.pathname;
    if (path.startsWith('/product/')) return 'pdp';
    if (path.startsWith('/products/')) return 'listing';
    return null;
  }

  function cleanupUi() {
    document.getElementById('csi-pdp-panel')?.remove();
    document.getElementById('csi-filter-bar')?.remove();
    // Keep compare tray — shared across routes
  }

  function ensureModules() {
    // listing + pdp scripts register init hooks on CSI.routes
  }

  function syncRoute() {
    const next = currentMode();
    if (next === mode) {
      CSI.routes?.onSameRoute?.(next);
      return;
    }
    CSI.log('route', mode, '->', next);
    const prev = mode;
    mode = next;
    cleanupUi();
    if (prev === 'listing') CSI.routes?.teardownListing?.();
    if (prev === 'pdp') CSI.routes?.teardownPdp?.();
    if (next === 'listing') CSI.routes?.startListing?.();
    if (next === 'pdp') CSI.routes?.startPdp?.();
  }

  function patchHistory() {
    if (window.__csiRouterPatched) return;
    window.__csiRouterPatched = true;
    const wrap = (name) => {
      const orig = history[name];
      history[name] = function (...args) {
        const r = orig.apply(this, args);
        setTimeout(syncRoute, 0);
        return r;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', () => setTimeout(syncRoute, 0));
  }

  CSI.routes = CSI.routes || {};
  CSI.router = { syncRoute, currentMode };

  // Boot after listing/pdp files register handlers
  function boot() {
    patchHistory();
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'cannabis-sage-bridge' || data.direction !== 'route') return;
      syncRoute();
    });
    // Defer so content-listing.js / content-pdp.js can register
    setTimeout(syncRoute, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

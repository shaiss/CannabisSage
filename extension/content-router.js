/**
 * Route router — SPA-aware listing ↔ PDP switching via active store adapter.
 * Honors remote host denylist (pause notice; no content inject).
 */
(function () {
  'use strict';
  const CSI = globalThis.CSI;
  if (!CSI) return;

  let mode = null; // 'listing' | 'pdp' | null
  let lastPathSeen = '';
  let paused = false;
  let denylistReady = false;

  function currentMode() {
    const adapter = CSI.registry?.refreshActiveAdapter?.() || CSI.registry?.getActiveAdapter?.();
    if (!adapter) return null;
    return adapter.routeMode(location.pathname) || null;
  }

  function cleanupSharedChrome() {
    document.getElementById('csi-filter-bar')?.remove();
  }

  function teardownAllEnhancements() {
    CSI.routes?.teardownListing?.();
    CSI.routes?.teardownPdp?.();
    cleanupSharedChrome();
    document.getElementById('csi-store-gate')?.remove();
  }

  async function refreshPauseState() {
    if (!CSI.denylist?.isCurrentHostPaused) {
      paused = false;
      denylistReady = true;
      return false;
    }
    paused = await CSI.denylist.isCurrentHostPaused();
    denylistReady = true;
    return paused;
  }

  function enterPausedMode() {
    teardownAllEnhancements();
    CSI.denylist?.showPauseNotice?.();
    mode = null;
  }

  function syncRoute(force) {
    if (!denylistReady) return;

    const path = location.pathname;

    // Denylist gate — calm pause, no retailer dunking
    if (paused) {
      if (!document.getElementById(CSI.denylist?.NOTICE_ID || 'csi-store-paused')) {
        CSI.denylist?.showPauseNotice?.();
      }
      lastPathSeen = path;
      return;
    }
    CSI.denylist?.removePauseNotice?.();

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

    if (next === 'listing') {
      CSI.entitlement?.refreshIsPro?.().finally(() => CSI.routes?.startListing?.());
    }
    if (next === 'pdp') {
      // Free: PDP allowed on primary store; multi-store PDPs require Pro
      CSI.entitlement?.refreshIsPro?.().finally(() => {
        if (!CSI.features?.canUseActiveStore?.()) {
          CSI.routes?.startListing?.(); // shows store gate banner path via listing
          return;
        }
        setTimeout(() => CSI.routes?.startPdp?.(), 200);
      });
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
    // Re-check denylist periodically (TTL is short; SW caches)
    setInterval(() => {
      refreshPauseState().then((isPaused) => {
        if (isPaused) enterPausedMode();
        else syncRoute(true);
      });
    }, 5 * 60 * 1000);

    refreshPauseState().then((isPaused) => {
      if (isPaused) {
        enterPausedMode();
        return;
      }
      syncRoute(true);
    });
  }

  CSI.routes = CSI.routes || {};
  CSI.router = { syncRoute, currentMode, refreshPauseState };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

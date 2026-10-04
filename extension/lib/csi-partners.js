/**
 * Remote partner registry — content-script helpers.
 * Fetches via background (HTTPS JSON only). Never executes remote JS.
 * Denylist wins: paused hosts get no partner chrome.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  let cached = null;
  let inflight = null;

  function lookupHost(hostname) {
    const host = hostname || (typeof location !== 'undefined' ? location.hostname : '');
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'CSI_PARTNERS_LOOKUP', host }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ chrome: null, failOpen: true });
            return;
          }
          resolve({
            chrome: res && res.chrome ? res.chrome : null,
            failOpen: !!(res && res.failOpen),
            stale: !!(res && res.stale),
            denied: !!(res && res.denied),
            fetchedAt: res?.fetchedAt || 0
          });
        });
      } catch {
        resolve({ chrome: null, failOpen: true });
      }
    });
  }

  function lookupCurrentHost() {
    return lookupHost(typeof location !== 'undefined' ? location.hostname : '');
  }

  function getChrome() {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
      inflight = lookupCurrentHost()
        .then((res) => {
          cached = res;
          return res;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  function removePartnerChips(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll?.('[data-csi-partner]')?.forEach((n) => n.remove());
  }

  /**
   * Insert a calm registry chip after the Sage explainer when the host is
   * community or verified. Quiet if lookup fails or denylist paused the host.
   */
  function mountChip(container) {
    if (!container) return Promise.resolve(null);
    return getChrome().then((res) => {
      if (!container.isConnected) return null;
      removePartnerChips(container);
      const info = res && res.chrome;
      if (!info) return null;
      const html = CSI.ui?.buildPartnerChip?.(info);
      if (!html) return null;
      const adds = container.querySelector('[data-csi-adds]');
      if (adds) adds.insertAdjacentHTML('afterend', html);
      else container.insertAdjacentHTML('afterbegin', html);
      return container.querySelector('[data-csi-partner]');
    });
  }

  CSI.partners = {
    lookupHost,
    lookupCurrentHost,
    getChrome,
    mountChip,
    removePartnerChips
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

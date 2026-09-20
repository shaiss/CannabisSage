/**
 * Remote store denylist — content-script helpers.
 * Fetches via background (HTTPS JSON only). Never executes remote JS.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  // TODO(legal): tone pass on pause notice copy
  const PAUSE_NOTICE = 'Support for this store is paused.';
  const NOTICE_ID = 'csi-store-paused';

  function checkHost(hostname) {
    const host = hostname || (typeof location !== 'undefined' ? location.hostname : '');
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'CSI_DENYLIST_CHECK', host }, (res) => {
          if (chrome.runtime.lastError) {
            // Fail-open if SW unavailable
            resolve({ denied: false, failOpen: true });
            return;
          }
          resolve({
            denied: !!(res && res.denied),
            failOpen: !!(res && res.failOpen),
            stale: !!(res && res.stale),
            fetchedAt: res?.fetchedAt || 0
          });
        });
      } catch {
        resolve({ denied: false, failOpen: true });
      }
    });
  }

  function removePauseNotice() {
    document.getElementById(NOTICE_ID)?.remove();
  }

  function showPauseNotice() {
    removePauseNotice();
    if (!document.body) return null;
    document.getElementById('csi-store-gate')?.remove();
    document.getElementById('csi-filter-bar')?.remove();
    document.getElementById('csi-pdp-panel')?.remove();
    const el = document.createElement('div');
    el.id = NOTICE_ID;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <strong>CannabisSage</strong>
      <span>${CSI.escapeHtml(PAUSE_NOTICE)}</span>
    `;
    document.body.appendChild(el);
    return el;
  }

  async function isCurrentHostPaused() {
    const result = await checkHost(location.hostname);
    return !!result.denied;
  }

  CSI.denylist = {
    PAUSE_NOTICE,
    NOTICE_ID,
    checkHost,
    isCurrentHostPaused,
    showPauseNotice,
    removePauseNotice
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

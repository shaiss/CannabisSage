/**
 * Feature gates — Free vs Pro.
 * Tweak FREE_FEATURES / PRO_FEATURES to change the split; keep docs/MONETIZATION.md in sync.
 *
 * Store access is the same on Free and Pro for every supported partner adapter.
 * `multiStore` gates cross-store soft match + store switcher (cached other-store
 * rows), not whether listing/PDP enhancement runs on a given host.
 */
(function (global) {
  'use strict';
  const CSI = global.CSI;
  if (!CSI) throw new Error('CSI core missing');

  /** Available without an active Pro license */
  const FREE_FEATURES = {
    hoverTooltip: true,
    basicBadges: true,
    compareTray: true,
    pdpPanel: true,
    similarByChem: true,
    tasteProfile: true
  };

  /** Requires Pro (active license) */
  const PRO_FEATURES = {
    tasteMap: true,
    filters: true,
    sort: true,
    exportCompare: true,
    /** Cross-store soft match + store switcher (not per-store listing/PDP access). */
    multiStore: true,
    dealBadges: true,
    picksForYou: true,
    /** One daily restock / price-drop / deal digest for saved items. Same gate on every store. */
    savedItemDigest: true
  };

  function hasPro() {
    return !!(CSI.entitlement && CSI.entitlement.isPro && CSI.entitlement.isPro());
  }

  function can(featureId) {
    if (FREE_FEATURES[featureId]) return true;
    if (PRO_FEATURES[featureId]) return hasPro();
    return false;
  }

  function requirePro(featureId) {
    return can(featureId);
  }

  CSI.features = {
    FREE_FEATURES,
    PRO_FEATURES,
    hasPro,
    can,
    requirePro
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/**
 * Feature gates — Free vs Pro.
 * Tweak FREE_FEATURES / PRO_FEATURES to change the split; keep docs/MONETIZATION.md in sync.
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
    sunnysideStore: true
  };

  /** Requires Pro (active license) */
  const PRO_FEATURES = {
    tasteMap: true,
    filters: true,
    sort: true,
    exportCompare: true,
    multiStore: true,
    dealBadges: true
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

  /** Whether the active adapter is allowed on the current plan. */
  function canUseActiveStore() {
    const adapter = CSI.registry?.getActiveAdapter?.();
    if (!adapter) return false;
    if (adapter.id === 'sunnyside') return can('sunnysideStore');
    return can('multiStore');
  }

  CSI.features = {
    FREE_FEATURES,
    PRO_FEATURES,
    hasPro,
    can,
    requirePro,
    canUseActiveStore
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

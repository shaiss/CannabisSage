export const FEATURE_GATES = {
  /** Always available without Pro */
  free: [
    'hoverTooltip',
    'basicBadges',
    'compareTray',
    'pdpPanel',
    'sunnysideStore'
  ],
  /** Requires active Pro license */
  pro: [
    'tasteMap',
    'filters',
    'sort',
    'exportCompare',
    'multiStore',
    'dealBadges'
  ]
} as const;

export type FreeFeature = (typeof FEATURE_GATES.free)[number];
export type ProFeature = (typeof FEATURE_GATES.pro)[number];
export type FeatureId = FreeFeature | ProFeature;

export function isProFeature(id: string): boolean {
  return (FEATURE_GATES.pro as readonly string[]).includes(id);
}

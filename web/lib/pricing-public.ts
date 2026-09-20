/**
 * Client-safe re-exports of pricing + feature labels (no Stripe secrets).
 */
import {
  LAUNCH_DATE,
  PROMO_DAYS,
  PRICE_PROMO_CENTS,
  PRICE_AFTER_PROMO_CENTS,
  promoEndsAt,
  isPromoActive,
  formatUsd,
  activePriceLabel
} from './pricing';

export {
  LAUNCH_DATE,
  PROMO_DAYS,
  PRICE_PROMO_CENTS,
  PRICE_AFTER_PROMO_CENTS,
  promoEndsAt,
  isPromoActive,
  formatUsd,
  activePriceLabel
};

export const FEATURE_GATES = {
  freeLabels: [
    'Hover chem tooltips',
    'Basic THC / terpene badges',
    'Compare tray (up to 3)',
    'Product detail panel',
    'Sunnyside store'
  ],
  proLabels: [
    'Taste-map match + editor',
    'Listing filters & sort',
    'CSV / JSON export',
    'Deal / $/mg badges',
    'Zen Leaf + TerraVida (multi-store)'
  ]
};

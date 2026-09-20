/**
 * Client-safe re-exports of pricing + feature labels (no Stripe secrets).
 */
import {
  LAUNCH_DATE,
  PROMO_DAYS,
  PRICE_PROMO_YEAR_CENTS,
  PRICE_PROMO_MONTH_CENTS,
  PRICE_REGULAR_YEAR_CENTS,
  PRICE_REGULAR_MONTH_CENTS,
  PRICE_PROMO_CENTS,
  PRICE_AFTER_PROMO_CENTS,
  promoEndsAt,
  isPromoActive,
  formatUsd,
  activePriceLabel,
  getPricingCatalog,
  quoteForCheckout,
  priceLine
} from './pricing';

export type { BillingInterval, PricingCatalog, PlanQuote } from './pricing';

export {
  LAUNCH_DATE,
  PROMO_DAYS,
  PRICE_PROMO_YEAR_CENTS,
  PRICE_PROMO_MONTH_CENTS,
  PRICE_REGULAR_YEAR_CENTS,
  PRICE_REGULAR_MONTH_CENTS,
  PRICE_PROMO_CENTS,
  PRICE_AFTER_PROMO_CENTS,
  promoEndsAt,
  isPromoActive,
  formatUsd,
  activePriceLabel,
  getPricingCatalog,
  quoteForCheckout,
  priceLine
};

export const FEATURE_GATES = {
  freeLabels: [
    'Hover chem tooltips',
    'Basic THC / terpene badges',
    'Compare tray (up to 3)',
    'Product detail panel',
    'Sunnyside store'
  ],
  /** Pro bullets lead with money-savers: match, Zen Leaf coverage, $/mg. */
  proLabels: [
    'Taste-map match on listings',
    'Zen Leaf + TerraVida coverage',
    '$/mg and deal badges',
    'Listing filters & sort',
    'CSV / JSON export'
  ]
};

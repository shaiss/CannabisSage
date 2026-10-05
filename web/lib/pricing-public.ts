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
    'Same-menu nearby chem',
    'Optional on-device taste profile',
    'Core supported dispensary menus'
  ],
  /** Pro bullets lead with money-savers: match, multi-store coverage, $/mg. */
  proLabels: [
    'Taste-map match on listings',
    'More stores you shop (multi-store, including cached PDP matches + store switcher)',
    '$/mg and deal badges',
    'Listing filters & sort',
    'CSV / JSON export',
    'Picks for you across nearby supported menus (cached)'
  ]
};

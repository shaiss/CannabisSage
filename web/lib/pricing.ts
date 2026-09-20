/**
 * Pricing + promo window (shared by landing copy and Checkout).
 *
 * Launch promo (PROMO_DAYS after LAUNCH_DATE): $9/year or $4/month.
 * Regular (after promo): $59/year or $9/month.
 *
 * Checkout charges via Stripe Price IDs from env — display cents below are for copy only.
 * Assay sets STRIPE_PRICE_ID_* on Vercel; do not invent Price IDs in this repo.
 */

export const PRODUCT_NAME = 'CannabisSage Pro';

export type BillingInterval = 'year' | 'month';

/** ISO calendar date (UTC) when the public launch / CWS publish is considered live. */
export const LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-09-20';

/** Length of the launch promo window. */
export const PROMO_DAYS = Number(process.env.PROMO_DAYS || 30);

/** Launch promo — annual ($9.00). */
export const PRICE_PROMO_YEAR_CENTS = 900;

/** Launch promo — monthly ($4.00). */
export const PRICE_PROMO_MONTH_CENTS = 400;

/** Regular list — annual ($59.00). */
export const PRICE_REGULAR_YEAR_CENTS = 5900;

/** Regular list — monthly ($9.00). */
export const PRICE_REGULAR_MONTH_CENTS = 900;

/** @deprecated Use PRICE_PROMO_YEAR_CENTS */
export const PRICE_PROMO_CENTS = PRICE_PROMO_YEAR_CENTS;

/** @deprecated Use PRICE_REGULAR_YEAR_CENTS */
export const PRICE_AFTER_PROMO_CENTS = Number(
  process.env.PRICE_AFTER_PROMO_CENTS || PRICE_REGULAR_YEAR_CENTS
);

export function promoEndsAt(launchDate = LAUNCH_DATE, promoDays = PROMO_DAYS): Date {
  const start = new Date(`${launchDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + promoDays);
  return end;
}

export function isPromoActive(now = new Date()): boolean {
  return now.getTime() < promoEndsAt().getTime();
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function intervalLabel(interval: BillingInterval): string {
  return interval === 'year' ? 'year' : 'month';
}

export function priceLine(cents: number, interval: BillingInterval): string {
  return `${formatUsd(cents)}/${intervalLabel(interval)}`;
}

export type PlanQuote = {
  cents: number;
  interval: BillingInterval;
  label: string;
};

export type PricingCatalog = {
  promo: boolean;
  promoEndsAt: string;
  promoPlans: { year: PlanQuote; month: PlanQuote };
  regularPlans: { year: PlanQuote; month: PlanQuote };
  promoHeadline: string;
  regularHeadline: string;
  fomoLine: string;
};

function planQuote(cents: number, interval: BillingInterval): PlanQuote {
  return { cents, interval, label: priceLine(cents, interval) };
}

export function getPricingCatalog(now = new Date()): PricingCatalog {
  const end = promoEndsAt();
  const promoActive = isPromoActive(now);
  const promoPlans = {
    year: planQuote(PRICE_PROMO_YEAR_CENTS, 'year'),
    month: planQuote(PRICE_PROMO_MONTH_CENTS, 'month')
  };
  const regularPlans = {
    year: planQuote(PRICE_REGULAR_YEAR_CENTS, 'year'),
    month: planQuote(PRICE_REGULAR_MONTH_CENTS, 'month')
  };
  return {
    promo: promoActive,
    promoEndsAt: end.toISOString().slice(0, 10),
    promoPlans,
    regularPlans,
    promoHeadline: `${promoPlans.year.label} or ${promoPlans.month.label}`,
    regularHeadline: `${regularPlans.year.label} or ${regularPlans.month.label}`,
    fomoLine: `Then ${regularPlans.year.label} or ${regularPlans.month.label}`
  };
}

/** Selected plan label for Checkout metadata (respects promo window). */
export function quoteForCheckout(interval: BillingInterval, now = new Date()): PlanQuote {
  const catalog = getPricingCatalog(now);
  const bucket = catalog.promo ? catalog.promoPlans : catalog.regularPlans;
  return bucket[interval];
}

/** Back-compat helper — defaults to promo-or-regular annual label. */
export function activePriceLabel(now = new Date()): {
  cents: number;
  label: string;
  promo: boolean;
  promoEndsAt: string;
} {
  const catalog = getPricingCatalog(now);
  const plan = quoteForCheckout('year', now);
  return {
    cents: plan.cents,
    label: plan.label,
    promo: catalog.promo,
    promoEndsAt: catalog.promoEndsAt
  };
}

function readEnvPrice(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value?.trim()) return value.trim();
  }
  return '';
}

/**
 * Resolve Stripe Price ID for Checkout (Stack / Vercel env names).
 *
 * Promo window:
 *   year  → STRIPE_PRICE_ID_PROMO ($9/yr)
 *   month → STRIPE_PRICE_ID_PROMO_MONTHLY ($4/mo)
 *
 * After promo:
 *   year  → STRIPE_PRICE_ID_REGULAR_ANNUAL | STRIPE_PRICE_ID_AFTER_PROMO ($59/yr)
 *   month → STRIPE_PRICE_ID_REGULAR_MONTHLY ($9/mo)
 */
export function resolveStripePriceId(
  interval: BillingInterval = 'year',
  now = new Date()
): string {
  const promo = isPromoActive(now);

  if (promo) {
    if (interval === 'year') {
      const id = readEnvPrice('STRIPE_PRICE_ID_PROMO', 'STRIPE_PRICE_ID');
      if (!id) {
        throw new Error('STRIPE_PRICE_ID_PROMO is not configured ($9/yr launch promo)');
      }
      return id;
    }
    const monthId = readEnvPrice('STRIPE_PRICE_ID_PROMO_MONTHLY');
    if (!monthId) {
      throw new Error('STRIPE_PRICE_ID_PROMO_MONTHLY is not configured ($4/mo launch promo)');
    }
    return monthId;
  }

  if (interval === 'year') {
    const id = readEnvPrice('STRIPE_PRICE_ID_REGULAR_ANNUAL', 'STRIPE_PRICE_ID_AFTER_PROMO');
    if (!id) {
      throw new Error(
        'STRIPE_PRICE_ID_REGULAR_ANNUAL (or STRIPE_PRICE_ID_AFTER_PROMO) is not configured ($59/yr)'
      );
    }
    return id;
  }

  const monthId = readEnvPrice('STRIPE_PRICE_ID_REGULAR_MONTHLY');
  if (!monthId) {
    throw new Error('STRIPE_PRICE_ID_REGULAR_MONTHLY is not configured ($9/mo)');
  }
  return monthId;
}

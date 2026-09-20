/**
 * Pricing + promo window (shared by landing copy and Checkout).
 *
 * Launch promo: $10 / year for PROMO_DAYS after LAUNCH_DATE.
 * After the window: use STRIPE_PRICE_ID_AFTER_PROMO if set, else keep the
 * promo price ID (PRICE_AFTER_PROMO_CENTS is a display/config placeholder —
 * do not invent a higher dollar amount in code).
 */

export const PRODUCT_NAME = 'CannabisSage Pro';

/** ISO calendar date (UTC) when the public launch / CWS publish is considered live. */
export const LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-09-20';

/** Length of the $10/year launch promo window. */
export const PROMO_DAYS = Number(process.env.PROMO_DAYS || 30);

/** Promo price in USD cents ($10.00). */
export const PRICE_PROMO_CENTS = 1000;

/**
 * Placeholder for post-promo list price in cents.
 * Default stays $10 — set PRICE_AFTER_PROMO_CENTS in env when you choose a new amount.
 * Checkout always charges via Stripe Price IDs, not these display cents alone.
 */
export const PRICE_AFTER_PROMO_CENTS = Number(
  process.env.PRICE_AFTER_PROMO_CENTS || PRICE_PROMO_CENTS
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

export function activePriceLabel(now = new Date()): {
  cents: number;
  label: string;
  promo: boolean;
  promoEndsAt: string;
} {
  const end = promoEndsAt();
  const promo = isPromoActive(now);
  const cents = promo ? PRICE_PROMO_CENTS : PRICE_AFTER_PROMO_CENTS;
  return {
    cents,
    label: `${formatUsd(cents)}/year`,
    promo,
    promoEndsAt: end.toISOString().slice(0, 10)
  };
}

/**
 * Resolve which Stripe Price ID to use for Checkout.
 * Env-driven only — no invented Price IDs or live keys in code.
 * Optional alias: STRIPE_PRICE_ID → same as STRIPE_PRICE_ID_PROMO.
 */
export function resolveStripePriceId(): string {
  const promoId = process.env.STRIPE_PRICE_ID_PROMO || process.env.STRIPE_PRICE_ID || '';
  const afterId = process.env.STRIPE_PRICE_ID_AFTER_PROMO || '';
  if (isPromoActive()) {
    if (!promoId) {
      throw new Error('STRIPE_PRICE_ID_PROMO (or STRIPE_PRICE_ID) is not configured');
    }
    return promoId;
  }
  if (!afterId && !promoId) {
    throw new Error('STRIPE_PRICE_ID_PROMO (or STRIPE_PRICE_ID) is not configured');
  }
  return afterId || promoId;
}

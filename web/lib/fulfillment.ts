import type Stripe from 'stripe';
import { generateLicenseKey, upsertLicense, findBySubscriptionId, type LicenseRecord } from './licenses';
import { getStripe } from './stripe';

function periodEndIso(sub: Stripe.Subscription): string | null {
  const end =
    (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end ??
    (sub as { items?: { data?: Array<{ current_period_end?: number }> } }).items?.data?.[0]
      ?.current_period_end;
  if (!end) return null;
  return new Date(end * 1000).toISOString();
}

function mapStatus(status: Stripe.Subscription.Status): LicenseRecord['status'] {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') return 'canceled';
  return 'inactive';
}

export async function ensureLicenseForSubscription(
  subscriptionId: string,
  opts: { email?: string | null; customerId?: string | null } = {}
): Promise<LicenseRecord> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const existingKey = sub.metadata?.license_key;
  const existing = await findBySubscriptionId(subscriptionId);

  let licenseKey = (existingKey || existing?.licenseKey || generateLicenseKey()).toUpperCase();

  if (!existingKey || existingKey !== licenseKey) {
    await stripe.subscriptions.update(subscriptionId, {
      metadata: {
        ...sub.metadata,
        license_key: licenseKey,
        product: 'cannabis-sage-pro'
      }
    });
  }

  if (opts.customerId || sub.customer) {
    const customerId = String(opts.customerId || sub.customer);
    try {
      await stripe.customers.update(customerId, {
        metadata: {
          license_key: licenseKey,
          product: 'cannabis-sage-pro'
        }
      });
    } catch {
      /* ignore customer update failures */
    }
  }

  return upsertLicense({
    licenseKey,
    status: mapStatus(sub.status),
    email: opts.email || existing?.email || null,
    stripeCustomerId: String(opts.customerId || sub.customer || '') || null,
    stripeSubscriptionId: subscriptionId,
    currentPeriodEnd: periodEndIso(sub)
  });
}

export async function syncSubscription(subscription: Stripe.Subscription): Promise<LicenseRecord | null> {
  const key = subscription.metadata?.license_key;
  const existing = await findBySubscriptionId(subscription.id);
  const licenseKey = (key || existing?.licenseKey || '').toUpperCase();
  if (!licenseKey) {
    // Create if missing (e.g. subscription created outside our checkout flow)
    return ensureLicenseForSubscription(subscription.id, {
      customerId: String(subscription.customer || '')
    });
  }
  return upsertLicense({
    licenseKey,
    status: mapStatus(subscription.status),
    email: existing?.email || null,
    stripeCustomerId: String(subscription.customer || existing?.stripeCustomerId || '') || null,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: periodEndIso(subscription)
  });
}

/** Stripe is source of truth; Neon (or local .data under ALLOW_DEV_MOCK) is the durable cache. */
export async function lookupLicenseViaStripe(licenseKey: string): Promise<LicenseRecord | null> {
  const key = licenseKey.trim().toUpperCase();
  if (!key) return null;
  try {
    const stripe = getStripe();
    const result = await stripe.subscriptions.search({
      query: `metadata['license_key']:'${key}'`,
      limit: 1
    });
    const sub = result.data[0];
    if (!sub) return null;
    return syncSubscription(sub);
  } catch {
    return null;
  }
}

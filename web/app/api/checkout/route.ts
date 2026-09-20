import { NextRequest, NextResponse } from 'next/server';
import { getStripe, siteUrl, randomSuffix } from '@/lib/stripe';
import {
  resolveStripePriceId,
  quoteForCheckout,
  isPromoActive,
  type BillingInterval
} from '@/lib/pricing';

function parseInterval(body: unknown): BillingInterval {
  if (body && typeof body === 'object' && 'interval' in body) {
    const value = (body as { interval?: string }).interval;
    if (value === 'month' || value === 'year') return value;
  }
  return 'year';
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const interval = parseInterval(body);
    const stripe = getStripe();
    const priceId = resolveStripePriceId(interval);
    const origin = siteUrl();
    const plan = quoteForCheckout(interval);
    const promoActive = isPromoActive();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        product: 'cannabis-sage-pro',
        billing_interval: interval,
        promo: promoActive ? '1' : '0',
        price_label: plan.label,
        integration_tag: `cannabis-sage-pro-${randomSuffix(8)}`
      },
      subscription_data: {
        metadata: {
          product: 'cannabis-sage-pro',
          billing_interval: interval
        }
      }
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout session missing URL' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

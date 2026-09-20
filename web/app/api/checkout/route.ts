import { NextResponse } from 'next/server';
import { getStripe, siteUrl, randomSuffix } from '@/lib/stripe';
import { resolveStripePriceId, activePriceLabel } from '@/lib/pricing';

export async function POST() {
  try {
    const stripe = getStripe();
    const priceId = resolveStripePriceId();
    const origin = siteUrl();
    const pricing = activePriceLabel();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        product: 'cannabis-sage-pro',
        promo: pricing.promo ? '1' : '0',
        price_label: pricing.label,
        integration_tag: `cannabis-sage-pro-${randomSuffix(8)}`
      },
      subscription_data: {
        metadata: {
          product: 'cannabis-sage-pro'
        }
      }
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout session missing URL' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id, pricing });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

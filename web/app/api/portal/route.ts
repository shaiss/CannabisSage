import { NextRequest, NextResponse } from 'next/server';
import { getStripe, siteUrl } from '@/lib/stripe';
import { getLicense } from '@/lib/licenses';
import { lookupLicenseViaStripe } from '@/lib/fulfillment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const licenseKey = String(body.licenseKey || '')
      .trim()
      .toUpperCase();
    let record = licenseKey ? getLicense(licenseKey) : null;
    if (licenseKey && !record) {
      record = await lookupLicenseViaStripe(licenseKey);
    }
    const customerId = record?.stripeCustomerId || body.customerId;
    if (!customerId) {
      return NextResponse.json(
        { error: 'Activate a license first, or pass a Stripe customer id.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: String(customerId),
      return_url: `${siteUrl()}/account`
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal session failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

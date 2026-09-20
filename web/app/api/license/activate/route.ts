import { NextRequest, NextResponse } from 'next/server';
import { getLicense, toEntitlementResponse, upsertLicense, generateLicenseKey } from '@/lib/licenses';
import { lookupLicenseViaStripe } from '@/lib/fulfillment';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let licenseKey = String(body.licenseKey || body.license_key || '')
      .trim()
      .toUpperCase();

    // Dev mock: create a 1-year active license without Stripe
    if (!licenseKey && process.env.ALLOW_DEV_MOCK === '1' && body.mock === true) {
      licenseKey = generateLicenseKey();
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const record = upsertLicense({
        licenseKey,
        status: 'active',
        email: body.email || 'dev@example.com',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: end.toISOString()
      });
      return NextResponse.json({
        ...toEntitlementResponse(record),
        mock: true,
        message: 'Dev mock license created. Set ALLOW_DEV_MOCK=0 in production.'
      });
    }

    if (!licenseKey || !/^CSG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(licenseKey)) {
      return NextResponse.json(
        { ok: false, active: false, error: 'Enter a license key like CSG-XXXX-XXXX-XXXX' },
        { status: 400 }
      );
    }

    let record = getLicense(licenseKey);
    if (!record || !record.stripeSubscriptionId) {
      const fromStripe = await lookupLicenseViaStripe(licenseKey);
      if (fromStripe) record = fromStripe;
    }

    const response = toEntitlementResponse(record);
    if (!response.ok) {
      return NextResponse.json(response, { status: 404 });
    }
    if (!response.active) {
      return NextResponse.json(
        { ...response, error: 'License found but subscription is not active' },
        { status: 402 }
      );
    }
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Activation failed';
    return NextResponse.json({ ok: false, active: false, error: message }, { status: 500 });
  }
}

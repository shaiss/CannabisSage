import { NextRequest, NextResponse } from 'next/server';
import { getLicense, toEntitlementResponse } from '@/lib/licenses';
import { lookupLicenseViaStripe } from '@/lib/fulfillment';

export async function GET(req: NextRequest) {
  const licenseKey = (req.nextUrl.searchParams.get('key') || '').trim().toUpperCase();
  if (!licenseKey) {
    return NextResponse.json({ ok: false, active: false, error: 'Missing key' }, { status: 400 });
  }

  try {
    let record = await getLicense(licenseKey);
    if (!record) {
      record = await lookupLicenseViaStripe(licenseKey);
    }
    const response = toEntitlementResponse(record);
    return NextResponse.json(response, { status: response.ok ? 200 : 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validate failed';
    return NextResponse.json({ ok: false, active: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const licenseKey = String(body.licenseKey || body.key || '')
    .trim()
    .toUpperCase();
  if (!licenseKey) {
    return NextResponse.json({ ok: false, active: false, error: 'Missing key' }, { status: 400 });
  }
  try {
    let record = await getLicense(licenseKey);
    if (!record) {
      record = await lookupLicenseViaStripe(licenseKey);
    }
    const response = toEntitlementResponse(record);
    return NextResponse.json(response, { status: response.ok ? 200 : 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Validate failed';
    return NextResponse.json({ ok: false, active: false, error: message }, { status: 500 });
  }
}

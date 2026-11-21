import { NextRequest, NextResponse } from 'next/server';
import { getLicense, toEntitlementResponse } from '@/lib/licenses';
import { lookupLicenseViaStripe } from '@/lib/fulfillment';

/** POST-only — never accept license keys in a GET query string. */
export async function GET() {
  return NextResponse.json(
    { ok: false, active: false, error: 'Method not allowed; use POST' },
    { status: 405, headers: { Allow: 'POST' } }
  );
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

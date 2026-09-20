import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { ensureLicenseForSubscription } from '@/lib/fulfillment';
import { getLicense, toEntitlementResponse } from '@/lib/licenses';

/** Success page helper: resolve license for a Checkout session id. */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session.subscription) {
      return NextResponse.json({ error: 'No subscription on session' }, { status: 400 });
    }
    const record = await ensureLicenseForSubscription(String(session.subscription), {
      email: session.customer_details?.email || session.customer_email || null,
      customerId: session.customer ? String(session.customer) : null
    });
    return NextResponse.json({
      ...toEntitlementResponse(record),
      email: record.email || session.customer_details?.email || null
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed';
    // Fallback: if webhook already wrote local cache, try nothing else
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

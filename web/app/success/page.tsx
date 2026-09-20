'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SuccessInner() {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing Checkout session id.');
      setLoading(false);
      return;
    }
    fetch(`/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load license');
        setLicenseKey(data.licenseKey || null);
        setEmail(data.email || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Lookup failed'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <main className="panel">
      <h1>You’re subscribed</h1>
      <p className="muted">
        Copy your license key and paste it into the CannabisSage extension popup → Activate license.
        Payments were handled on Stripe Checkout — nothing was entered in the extension.
      </p>
      {loading ? <p>Loading license…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {licenseKey ? (
        <>
          <p>
            <strong>License key</strong>
            {email ? <span className="muted"> · {email}</span> : null}
          </p>
          <div className="license-box">{licenseKey}</div>
          <p className="muted" style={{ marginTop: '1rem' }}>
            Keep this key private. You can also open Manage subscription from the extension after
            activating.
          </p>
        </>
      ) : null}
      <p style={{ marginTop: '1.5rem' }}>
        <a className="btn btn-primary" href="/account">
          Activation help
        </a>{' '}
        <a className="btn btn-ghost" href="/" style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}>
          Home
        </a>
      </p>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<main className="panel">Loading…</main>}>
      <SuccessInner />
    </Suspense>
  );
}

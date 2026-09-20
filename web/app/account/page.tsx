'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AccountPage() {
  const [licenseKey, setLicenseKey] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function validate() {
    setError(null);
    setResult(null);
    const res = await fetch('/api/license/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey })
    });
    const data = await res.json();
    if (!res.ok || !data.active) {
      setError(data.error || 'License not active');
      return;
    }
    setResult(
      `Active through ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : 'current period'}`
    );
  }

  async function openPortal() {
    setError(null);
    const res = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey })
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      setError(data.error || 'Could not open portal');
      return;
    }
    window.location.href = data.url;
  }

  return (
    <main className="panel">
      <h1>Activate & manage</h1>
      <p className="muted">
        After Stripe Checkout, paste your <code>CSG-…</code> key into the extension popup. You can
        also verify it here or open the Customer Portal to update payment method / cancel.
      </p>
      <label>
        License key
        <input
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="CSG-XXXX-XXXX-XXXX"
          style={{ display: 'block', width: '100%', marginTop: 6, padding: '0.6rem' }}
        />
      </label>
      <div className="cta-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={validate}>
          Check status
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ color: 'var(--ink)', borderColor: 'var(--sand)' }}
          onClick={openPortal}
        >
          Manage subscription
        </button>
      </div>
      {result ? <p style={{ color: 'var(--moss)', fontWeight: 700 }}>{result}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        <Link href="/">← Home</Link>
      </p>
    </main>
  );
}

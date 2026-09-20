'use client';

import { useState } from 'react';

export function CheckoutButton({
  label,
  className = 'btn btn-primary'
}: {
  label: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start Checkout');
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} onClick={startCheckout} disabled={loading}>
        {loading ? 'Redirecting…' : label}
      </button>
      {error ? <p className="error muted">{error}</p> : null}
    </div>
  );
}

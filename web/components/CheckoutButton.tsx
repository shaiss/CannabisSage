'use client';

import { useState } from 'react';
import type { BillingInterval } from '@/lib/pricing-public';

export function CheckoutButton({
  label,
  className = 'btn btn-primary',
  defaultInterval = 'year',
  showPlanPicker = false,
  promoYearLabel,
  promoMonthLabel
}: {
  label: string;
  className?: string;
  defaultInterval?: BillingInterval;
  showPlanPicker?: boolean;
  promoYearLabel?: string;
  promoMonthLabel?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);

  async function startCheckout(selected: BillingInterval = interval) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interval: selected })
      });
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

  if (showPlanPicker && promoYearLabel && promoMonthLabel) {
    return (
      <div className="checkout-picker">
        <div className="plan-toggle" role="group" aria-label="Billing interval">
          <button
            type="button"
            className={`plan-toggle-btn${interval === 'year' ? ' is-active' : ''}`}
            onClick={() => setInterval('year')}
            disabled={loading}
          >
            Annual · {promoYearLabel}
          </button>
          <button
            type="button"
            className={`plan-toggle-btn${interval === 'month' ? ' is-active' : ''}`}
            onClick={() => setInterval('month')}
            disabled={loading}
          >
            Monthly · {promoMonthLabel}
          </button>
        </div>
        <button
          type="button"
          className={className}
          onClick={() => startCheckout(interval)}
          disabled={loading}
        >
          {loading ? 'Redirecting…' : label}
        </button>
        {error ? <p className="error muted">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <button type="button" className={className} onClick={() => startCheckout()} disabled={loading}>
        {loading ? 'Redirecting…' : label}
      </button>
      {error ? <p className="error muted">{error}</p> : null}
    </div>
  );
}

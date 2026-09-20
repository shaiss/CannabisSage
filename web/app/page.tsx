import { CheckoutButton } from '@/components/CheckoutButton';
import { activePriceLabel, FEATURE_GATES } from '@/lib/pricing-public';

export default function HomePage() {
  const pricing = activePriceLabel();

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          CannabisSage
        </a>
        <nav className="nav-links">
          <a href="#pricing">Pricing</a>
          <a href="#features">Features</a>
          <a href="/account">Activate</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <h1 className="brand-hero">CannabisSage</h1>
          <p>
            Retailer-published cannabinoid and terpene insights on Sunnyside and Zen Leaf — compare,
            filter, and match your taste map. Not medical advice.
          </p>
          <div className="cta-row">
            <CheckoutButton label={`Go Pro — ${pricing.label}`} />
            <a className="btn btn-ghost" href="#features">
              See what’s free
            </a>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <h2>Free vs Pro</h2>
        <p>
          Payments happen on Stripe Checkout (hosted) — never inside the Chrome extension. After
          purchase, activate your license key in the extension popup.
        </p>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <div className="price-card">
            <strong>Free</strong>
            <ul className="feature-list">
              {FEATURE_GATES.freeLabels.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="price-card">
            <strong>Pro</strong>
            <ul className="feature-list">
              {FEATURE_GATES.proLabels.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <h2>Launch pricing</h2>
        <div className="price-card">
          <div className="amount">{pricing.label}</div>
          {pricing.promo ? (
            <span className="promo">Launch promo through {pricing.promoEndsAt} (30 days from launch)</span>
          ) : (
            <span className="muted">Promo window ended {pricing.promoEndsAt}. Price is configurable via env.</span>
          )}
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            One-year subscription. Manage or cancel anytime in the Stripe Customer Portal.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <CheckoutButton label="Subscribe with Stripe Checkout" />
          </div>
        </div>
      </section>

      <footer className="footer">
        CannabisSage displays retailer-published chemistry. Not medical advice. ·{' '}
        <a href="https://github.com/shaiss/CannabisSage">GitHub</a>
      </footer>
    </>
  );
}

import Image from 'next/image';
import { CheckoutButton } from '@/components/CheckoutButton';
import { activePriceLabel, FEATURE_GATES } from '@/lib/pricing-public';

const CHROME_STORE_SEARCH =
  'https://chrome.google.com/webstore/search/CannabisSage';

export default function HomePage() {
  const pricing = activePriceLabel();

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          CannabisSage
        </a>
        <nav className="nav-links">
          <a href="#proof">See it work</a>
          <a href="#why-pro">Why Pro</a>
          <a href="#pricing">Pricing</a>
          <a href="/account">Activate</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">Chrome extension · Sunnyside &amp; Zen Leaf</p>
          <h1 className="brand-hero">Shop menus with chemistry on the page—not buried in every PDP.</h1>
          <p>
            CannabisSage surfaces retailer-published cannabinoid and terpene data while you browse.
            Compare picks, spot value badges, and (with Pro) filter and match your taste map—without
            opening ten product tabs.
          </p>
          <div className="cta-row">
            <a
              className="btn btn-primary"
              href={CHROME_STORE_SEARCH}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get the extension
            </a>
            <CheckoutButton label={`Try Pro — ${pricing.label}`} className="btn btn-ghost" />
          </div>
          <p className="hero-footnote muted-on-dark">
            Chrome Web Store listing coming soon — search link above until publish. Already subscribed?{' '}
            <a href="/account">Activate your key</a> in the popup.
          </p>
        </div>
      </section>

      <div className="trust-strip" role="note">
        <p>
          <strong>Not medical advice.</strong> Retailer-published data only. Payments use{' '}
          <strong>Stripe-hosted checkout</strong> on cannabissage.app — cards are never collected in
          the extension. · <a href="/privacy">Privacy</a>
        </p>
      </div>

      <section className="section" id="proof">
        <h2>See it on a real menu</h2>
        <p>Screenshots from supported dispensary sites. Captions describe shopping workflow only.</p>
        <div className="proof-grid">
          <figure className="proof-card">
            <Image
              src="/screenshots/listing.png"
              alt="Product listing with CannabisSage badges and compare controls"
              width={960}
              height={540}
              className="proof-shot"
              priority
            />
            <figcaption>
              <strong>Listing view</strong> — THC and terpene badges on each card, plus compare
              without leaving the grid.
            </figcaption>
          </figure>
          <figure className="proof-card">
            <Image
              src="/screenshots/pdp.png"
              alt="Product detail page with inline chemistry panel and compare button"
              width={960}
              height={540}
              className="proof-shot"
            />
            <figcaption>
              <strong>Product page</strong> — Inline chem summary, sale/value badges, and add-to-compare
              on the PDP you already have open.
            </figcaption>
          </figure>
          <figure className="proof-card">
            <Image
              src="/screenshots/popup.png"
              alt="Extension popup with taste map preferences and upgrade path"
              width={960}
              height={540}
              className="proof-shot"
            />
            <figcaption>
              <strong>Taste map &amp; upgrade</strong> — Set terpene preferences locally; Pro unlocks map
              match on listings and checkout from the popup.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section section-alt" id="why-pro">
        <h2>Why shoppers upgrade to Pro</h2>
        <p>Pro is for faster decisions across stores—not a spreadsheet of feature flags.</p>
        <div className="why-grid">
          <article className="why-card">
            <h3>Save time on big menus</h3>
            <p>
              Filter and sort listings so you are not scrolling every hybrid on the page. Free still
              gives hover tooltips, badges, compare, and PDP panels on Sunnyside.
            </p>
          </article>
          <article className="why-card">
            <h3>Find what you will actually pick</h3>
            <p>
              Taste-map match scores listings against terpene weights you set—saved on your device.
              Map match on grids is Pro; editing preferences is available in the popup anytime.
            </p>
          </article>
          <article className="why-card">
            <h3>Shop more than one retailer</h3>
            <p>
              Pro adds Zen Leaf and TerraVida adapters, deal and $/mg badges, and CSV/JSON export when
              you want a record of what the menu showed—not medical guidance.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="pricing">
        <h2>Launch pricing</h2>
        <div className="price-card price-card-wide">
          <div className="amount">{pricing.label}</div>
          {pricing.promo ? (
            <span className="promo">
              Launch promo through {pricing.promoEndsAt} (30 days from public launch)
            </span>
          ) : (
            <span className="muted">Promo window ended {pricing.promoEndsAt}.</span>
          )}
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            One-year subscription on cannabissage.app. Cancel anytime in the Stripe Customer Portal.
          </p>
          <div className="pricing-unlock">
            <p>
              <strong>After checkout:</strong> copy your license key from the success page, open the
              CannabisSage popup on any supported menu, paste under <em>Activate</em>, and Pro features
              unlock immediately.
            </p>
          </div>
          <div className="cta-row cta-row-light" style={{ marginTop: '1.25rem' }}>
            <CheckoutButton label={`Subscribe — ${pricing.label}`} />
            <a className="btn btn-outline" href="/account">
              I have a key — activate
            </a>
          </div>
          <details className="plan-details">
            <summary>What&apos;s included in Free vs Pro</summary>
            <div className="plan-columns">
              <div>
                <strong>Free</strong>
                <ul className="feature-list">
                  {FEATURE_GATES.freeLabels.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Pro</strong>
                <ul className="feature-list">
                  {FEATURE_GATES.proLabels.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      </section>

      <footer className="footer">
        CannabisSage · cannabissage.app · Retailer-published chemistry for shopping. Not medical
        advice. · <a href="/privacy">Privacy</a>
        {' · '}
        <a href="https://github.com/shaiss/CannabisSage">GitHub</a>
      </footer>
    </>
  );
}

import Image from 'next/image';
import { CheckoutButton } from '@/components/CheckoutButton';
import { getPricingCatalog, FEATURE_GATES } from '@/lib/pricing-public';

const CHROME_STORE_SEARCH =
  'https://chrome.google.com/webstore/search/CannabisSage';

export default function HomePage() {
  const pricing = getPricingCatalog();

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
          <p className="hero-eyebrow">Chrome extension · supported dispensary menus</p>
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
            <CheckoutButton
              label="Try Pro — launch promo"
              className="btn btn-ghost"
              defaultInterval="year"
            />
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
        <p>
          Pro money-savers first: match what you like, cover more of the stores you shop, and spot
          $/mg value—not fluff.
        </p>
        <div className="why-grid">
          <article className="why-card">
            <h3>Match what you will pick</h3>
            <p>
              Taste-map match scores listings against terpene weights you set on your device. Free
              still gives hover tooltips, badges, compare, and PDP panels on supported menus.
            </p>
          </article>
          <article className="why-card">
            <h3>Across stores you shop</h3>
            <p>
              Pro extends chem badges across more supported dispensary menus—so insights travel with
              you, not just one site.
            </p>
          </article>
          <article className="why-card">
            <h3>$/mg and deal badges</h3>
            <p>
              See $/mg and deal flags on the page so value is obvious before you open another tab.
              A below-median mark shows only when the listed price and the category median are both
              on the menu. Filters, sort, and export are included when you want a record of the menu.
            </p>
          </article>
        </div>
      </section>

      <section className="section" id="whats-next" aria-labelledby="whats-next-heading">
        <h2 id="whats-next-heading">Coming soon</h2>
        <p>
          Next up on product pages—chem-first shopping tools. No ship-date guarantees; we ship when
          each piece is solid.
        </p>
        <ul className="fomo-list">
          <li>
            <strong>Match across stores</strong> — Soft-match the same chem profile when you jump
            retailers.
          </li>
          <li>
            <strong>$/mg multi-store compare</strong> — Side-by-side value across supported menus.
          </li>
          <li>
            <strong>Similar-by-chem when something is OOS</strong> — Same-menu neighbors by chemistry
            when a pick is gone.
          </li>
        </ul>
        <p className="fomo-always muted">
          Always: chem-first browsing. Retailer-published data only—never medical or effects claims.
        </p>
      </section>

      <section className="section" id="pricing">
        <h2>Launch pricing</h2>
        <div className="price-card price-card-wide">
          {pricing.promo ? (
            <>
              <div className="price-duo">
                <div>
                  <span className="price-duo-label">Annual promo</span>
                  <div className="amount">{pricing.promoPlans.year.label}</div>
                </div>
                <div>
                  <span className="price-duo-label">Monthly promo</span>
                  <div className="amount amount-sm">{pricing.promoPlans.month.label}</div>
                </div>
              </div>
              <span className="promo">
                Launch promo through {pricing.promoEndsAt} ({pricing.promoHeadline}).{' '}
                <strong>{pricing.fomoLine}</strong> after the window.
              </span>
            </>
          ) : (
            <>
              <div className="price-duo">
                <div>
                  <span className="price-duo-label">Annual</span>
                  <div className="amount">{pricing.regularPlans.year.label}</div>
                </div>
                <div>
                  <span className="price-duo-label">Monthly</span>
                  <div className="amount amount-sm">{pricing.regularPlans.month.label}</div>
                </div>
              </div>
              <span className="muted">Launch promo ended {pricing.promoEndsAt}. Standard pricing applies.</span>
            </>
          )}
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Subscriptions on cannabissage.app (Stripe-hosted checkout). Cancel anytime in the Stripe
            Customer Portal.
          </p>
          <div className="pricing-unlock">
            <p>
              <strong>After checkout:</strong> copy your license key from the success page, open the
              CannabisSage popup on any supported menu, paste under <em>Activate</em>, and Pro features
              unlock immediately.
            </p>
          </div>
          <div className="cta-row cta-row-light" style={{ marginTop: '1.25rem' }}>
            <CheckoutButton
              label="Subscribe with Stripe Checkout"
              showPlanPicker
              promoYearLabel={pricing.promo ? pricing.promoPlans.year.label : pricing.regularPlans.year.label}
              promoMonthLabel={pricing.promo ? pricing.promoPlans.month.label : pricing.regularPlans.month.label}
            />
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

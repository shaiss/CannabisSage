import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — CannabisSage',
  description:
    'Privacy policy for the CannabisSage Chrome extension and CannabisSage website (Stripe Checkout, license entitlement).'
};

export default function PrivacyPage() {
  return (
    <>
      <header className="site-header site-header-static">
        <Link className="brand" href="/">
          CannabisSage
        </Link>
        <nav className="nav-links">
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#features">Features</Link>
          <Link href="/account">Activate</Link>
        </nav>
      </header>

      <main className="legal-page">
        <article className="legal-article">
          <h1>Privacy Policy — CannabisSage</h1>
          <p className="legal-meta">
            <strong>Last updated:</strong> September 20, 2026
            <br />
            <strong>Extension version covered:</strong> 1.3.x
          </p>
          <p>
            CannabisSage is a Chrome extension that helps shoppers view cannabinoid and terpene
            information on supported retailer product listing and detail pages (Sunnyside; Zen Leaf
            Dispensaries; TerraVida shopping via Zen Leaf Malvern), compare a small number of
            products, filter/sort visible cards, and score products against a local taste preference
            map. Optional <strong>Pro</strong> features unlock after a subscription purchased on
            the CannabisSage website via <strong>Stripe Checkout</strong> (not inside the
            extension).
          </p>

          <h2>Summary</h2>
          <p>
            CannabisSage does <strong>not</strong> sell personal data. The free extension does not
            require an account. Paid Pro uses Stripe-hosted Checkout on the CannabisSage website;
            the extension only stores a license key and entitlement status you activate locally.
          </p>

          <h2>Data the extension accesses</h2>
          <p>When you use CannabisSage on a supported store page:</p>
          <ol>
            <li>
              <strong>Page content (local):</strong> Product card and detail-page information
              already present in the page.
            </li>
            <li>
              <strong>Product detail pages (network):</strong> Same-site HTTPS fetches to retailer
              hosts when chemistry details are missing.
            </li>
            <li>
              <strong>Local extension storage (`chrome.storage.local`):</strong> Compare selections,
              taste-map preferences, filters, TTL product cache, and (if you activate Pro) license
              key + entitlement expiry.
            </li>
            <li>
              <strong>Bundled JSON:</strong> Default taste-map seeds, terpene glossary, and API base
              URL config.
            </li>
          </ol>

          <h2>Payments &amp; Pro entitlement</h2>
          <ul>
            <li>
              <strong>Cards are never collected in the extension UI.</strong> Upgrade opens the
              CannabisSage website, which redirects to <strong>Stripe Checkout</strong> (hosted by
              Stripe).
            </li>
            <li>
              After payment, Stripe may process your <strong>email</strong> and payment details under
              Stripe’s privacy policy. CannabisSage’s server may store license key, Stripe
              customer/subscription ids, subscription status, period end, and checkout email to
              fulfill entitlement.
            </li>
            <li>
              The extension calls the CannabisSage HTTPS API (
              <code>/api/license/activate</code>, <code>/api/license/validate</code>) to activate or
              refresh Pro status. No remote extension code is downloaded.
            </li>
          </ul>

          <h2>Data we do not collect</h2>
          <p>CannabisSage does <strong>not</strong>:</p>
          <ul>
            <li>Create retailer login credentials or scrape account passwords</li>
            <li>Embed analytics SDKs or advertising trackers in the extension</li>
            <li>Execute remote code or load store adapters from the network</li>
            <li>Collect payment card numbers inside the extension</li>
          </ul>

          <h2>Permissions explained</h2>
          <div className="legal-table-wrap">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Permission / host</th>
                  <th>Why it is needed</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>https://www.sunnyside.shop/*</code>,{' '}
                    <code>https://sunnyside.shop/*</code>
                  </td>
                  <td>Sunnyside listings/PDPs and same-site product HTML.</td>
                </tr>
                <tr>
                  <td>
                    <code>https://zenleafdispensaries.com/*</code>,{' '}
                    <code>https://www.zenleafdispensaries.com/*</code>
                  </td>
                  <td>Zen Leaf / Malvern (TerraVida alias) menus and PDPs.</td>
                </tr>
                <tr>
                  <td><code>https://cannabissage.app/*</code></td>
                  <td>
                    Primary production origin: entitlement activate/validate against the CannabisSage
                    API; Upgrade/Manage deep links.
                  </td>
                </tr>
                <tr>
                  <td><code>https://cannabissage.vercel.app/*</code></td>
                  <td>Vercel deployment fallback for the same APIs and deep links.</td>
                </tr>
                <tr>
                  <td><code>http://localhost:3000/*</code> (unpacked local/dev only)</td>
                  <td>
                    Same entitlement APIs when running <code>web/</code> locally; keep for unpacked
                    testing. Override via <code>chrome.storage.local.csi_api_base</code> or edit{' '}
                    <code>data/config.json</code>.
                  </td>
                </tr>
                <tr>
                  <td>Optional <code>https://*.vercel.app/*</code></td>
                  <td>Optional preview deployments when you grant them.</td>
                </tr>
                <tr>
                  <td><code>storage</code></td>
                  <td>Persist compare, prefs, filters, cache, and license entitlement on device.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Not declared:</strong> <code>terravidahc.com</code> (not an ecommerce catalog).
          </p>

          <h2>Third parties</h2>
          <ul>
            <li>
              Retailer hosts you already browse (<code>sunnyside.shop</code>,{' '}
              <code>zenleafdispensaries.com</code>)
            </li>
            <li>
              <strong>Stripe</strong> (Checkout, Billing, Customer Portal) when you purchase or
              manage Pro — see{' '}
              <a href="https://stripe.com/privacy" rel="noopener noreferrer">
                Stripe Privacy Policy
              </a>
            </li>
          </ul>

          <h2>Children</h2>
          <p>
            CannabisSage is not directed at children. Cannabis product browsing is subject to
            applicable age and jurisdiction restrictions on the retailer site.
          </p>

          <h2>Changes</h2>
          <p>
            If this privacy policy changes in a material way, the “Last updated” date above will be
            revised and the store listing / repository copy will be updated.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy questions, open an issue on the public repository:{' '}
            <a href="https://github.com/shaiss/CannabisSage">https://github.com/shaiss/CannabisSage</a>
            .
          </p>

          <p className="muted" style={{ marginTop: '2rem' }}>
            <Link href="/">← Home</Link>
          </p>
        </article>
      </main>

      <footer className="footer">
        CannabisSage displays retailer-published chemistry. Not medical advice. ·{' '}
        <Link href="/privacy">Privacy</Link>
        {' · '}
        <a href="https://github.com/shaiss/CannabisSage">GitHub</a>
      </footer>
    </>
  );
}

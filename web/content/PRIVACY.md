# Privacy Policy — CannabisSage

**Last updated:** September 20, 2026  
**Extension version covered:** 1.3.x

CannabisSage is a Chrome extension that helps shoppers view cannabinoid and terpene information on supported retailer product listing and detail pages, compare a small number of products, filter/sort visible cards, and score products against a local taste preference map. Optional **Pro** features unlock after a subscription purchased on the CannabisSage website via **Stripe Checkout** (not inside the extension).

## Summary

CannabisSage does **not** sell personal data. The free extension does not require an account. Paid Pro uses Stripe-hosted Checkout on the CannabisSage website; the extension only stores a license key and entitlement status you activate locally.

## Data the extension accesses

When you use CannabisSage on a supported store page:

1. **Page content (local):** Product card and detail-page information already present in the page.
2. **Product detail pages (network):** Same-site HTTPS fetches to retailer hosts when chemistry details are missing.
3. **Local extension storage (`chrome.storage.local`):** Compare selections, taste-map preferences, filters, TTL product cache, remote denylist cache, and (if you activate Pro) license key + entitlement expiry.
4. **Bundled JSON:** Default taste-map seeds, terpene glossary, and API base URL config.
5. **CannabisSage site (network):** Entitlement APIs and a small HTTPS **denylist JSON** (`/denylist.json`) — configuration only, never executable code.

## Payments & Pro entitlement

- **Cards are never collected in the extension UI.** Upgrade opens the CannabisSage website, which redirects to **Stripe Checkout** (hosted by Stripe).
- After payment, Stripe may process your **email** and payment details under Stripe’s privacy policy. CannabisSage’s server may store license key, Stripe customer/subscription ids, subscription status, period end, and checkout email to fulfill entitlement.
- The extension calls the CannabisSage HTTPS API (`/api/license/activate`, `/api/license/validate`) to activate or refresh Pro status. No remote extension code is downloaded.

## Data we do not collect

CannabisSage does **not**:

- Create retailer login credentials or scrape account passwords
- Embed analytics SDKs or advertising trackers in the extension
- Execute remote code or load store adapters from the network
- Collect payment card numbers inside the extension

## Permissions explained

| Permission / host | Why it is needed |
| --- | --- |
| `https://www.sunnyside.shop/*`, `https://sunnyside.shop/*` | Supported retailer listings/PDPs and same-site product HTML on this host. |
| `https://zenleafdispensaries.com/*`, `https://www.zenleafdispensaries.com/*` | Supported retailer menus/PDPs and same-site product HTML on this host (including location path aliases). |
| `https://cannabissage.app/*` | Primary production origin: entitlement activate/validate against the CannabisSage API; Upgrade/Manage deep links; remote denylist JSON. |
| `https://cannabissage.vercel.app/*` | Vercel deployment fallback for the same APIs, deep links, and denylist. |
| `http://localhost:3000/*` (unpacked local/dev only) | Same entitlement APIs / denylist when running `web/` locally; keep for unpacked testing. Override via `chrome.storage.local.csi_api_base` or edit `data/config.json`. |
| Optional `https://*.vercel.app/*` | Optional preview deployments when you grant them. |
| `storage` | Persist compare, prefs, filters, cache, denylist cache, and license entitlement on device. |

**Not declared:** `terravidahc.com` (not an ecommerce catalog).

## Third parties

- Retailer hosts you already browse (`sunnyside.shop`, `zenleafdispensaries.com`)
- **Stripe** (Checkout, Billing, Customer Portal) when you purchase or manage Pro — see [Stripe Privacy Policy](https://stripe.com/privacy)

## Children

CannabisSage is not directed at children. Cannabis product browsing is subject to applicable age and jurisdiction restrictions on the retailer site.

## Changes

If this privacy policy changes in a material way, the “Last updated” date above will be revised and the store listing / repository copy will be updated.

## Contact

For privacy questions, open an issue on the public repository: [https://github.com/shaiss/CannabisSage](https://github.com/shaiss/CannabisSage).

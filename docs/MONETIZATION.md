# CannabisSage monetization (P3)

Stripe Checkout (hosted) + license keys + extension entitlement. **No card collection inside the Chrome extension** (CWS policy).

## Offer (Shai pricing lock)

| Window | Annual | Monthly | Stripe env |
| --- | --- | --- | --- |
| **Launch promo** (first **30 days** after `LAUNCH_DATE`) | **$9 / year** | **$4 / month** | `STRIPE_PRICE_ID_PROMO`, `STRIPE_PRICE_ID_PROMO_MONTHLY` |
| **Regular** (after promo) | **$99 / year** | **$9 / month** | `STRIPE_PRICE_ID_REGULAR_ANNUAL` (alias: `STRIPE_PRICE_ID_AFTER_PROMO`), `STRIPE_PRICE_ID_REGULAR_MONTHLY` |

Display amounts live in `web/lib/pricing.ts` (`PRICE_*_CENTS`). Checkout always charges the configured Stripe Price IDs — not the cent constants alone.

Defaults:

- `LAUNCH_DATE=2026-09-20` (set to real CWS/public launch day)
- `PROMO_DAYS=30` → promo ends **2026-10-20** with the default launch date

### Marketplace sandbox (partial — Assay / Shai)

Test-mode Price IDs already created (promo annual $9 and regular monthly $9 may be pending card approval):

| Price | Amount | Price ID (test) |
| --- | --- | --- |
| Promo monthly | $4/mo | `price_1UHikzATpHsAXg8mLqGkTbdi` |
| Regular annual | $99/yr | `price_1UHikzATpHsAXg8mECO1ZvjR` |

Set on Vercel when approved:

```bash
STRIPE_PRICE_ID_PROMO_MONTHLY=price_1UHikzATpHsAXg8mLqGkTbdi
STRIPE_PRICE_ID_REGULAR_ANNUAL=price_1UHikzATpHsAXg8mECO1ZvjR
# Pending Shai approval:
# STRIPE_PRICE_ID_PROMO=price_...
# STRIPE_PRICE_ID_REGULAR_MONTHLY=price_...
```

Landing Checkout sends `POST /api/checkout` with JSON `{ "interval": "year" | "month" }` to pick the Price ID for the active window.

## Feature gates

Defined in `extension/lib/csi-features.js` and mirrored for the landing page in `web/lib/feature-gates.ts` / `pricing-public.ts`.

| Free | Pro |
| --- | --- |
| Hover tooltips | Taste-map match on listings |
| Basic THC / terpene badges | Filters & sort |
| Compare tray (≤3) | CSV / JSON export |
| PDP panel | Deal / $/mg badges |
| Sunnyside store | Zen Leaf + TerraVida (multi-store) |

Taste prefs can still be edited in the popup on Free; they apply on listings only when Pro is active.

## Architecture

```
Extension popup ──Upgrade──► web/ landing ──► Stripe Checkout (hosted)
       │                                              │
       │ Activate CSG-… key                           ▼
       ▼                                    webhook → license in Stripe
  chrome.storage entitlement                metadata + Neon `licenses`
       │
       ▼
  csi-features.can(...) gates listing UI
```

- **Source of truth:** Stripe Subscription status + `metadata.license_key`
- **Durable store:** Neon Postgres via `DATABASE_URL` (or `POSTGRES_URL`) — schema `web/db/migrations/001_licenses.sql`; CRUD only in `web/lib/licenses.ts`
- **Dev fallback:** `web/.data/licenses.json` only when `ALLOW_DEV_MOCK=1` **and** no `DATABASE_URL` (prod fails closed without DB)
- **Prod API:** `https://cannabissage.app` (Vercel fallback: `https://cannabissage.vercel.app`)
- **APIs:** `/api/checkout`, `/api/webhook`, `/api/license/activate`, `/api/license/validate`, `/api/portal`, `/api/checkout/session`

## Stripe Dashboard setup

1. Create Product **CannabisSage Pro** with four recurring Prices ($9/yr promo, $4/mo promo, $99/yr regular, $9/mo regular) → map to env vars above.
2. Add webhook endpoint `https://<your-domain>/api/webhook` for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Enable **Customer Portal** (cancel / update payment method).
4. Copy secrets into `web/.env.local` from `web/.env.example` (never commit secrets).

**Tax:** If you charge US/EU customers, review [Stripe Tax for subscriptions](https://docs.stripe.com/billing/taxes/collect-taxes) and register before enabling `automatic_tax` (not enabled by default here).

## Local development

```bash
cd web
cp .env.example .env.local   # fill Stripe test keys + price ids
npm install
npm run dev                  # http://localhost:3000

# separate terminal — forward webhooks
stripe listen --forward-to localhost:3000/api/webhook
```

Extension `data/config.json` defaults `apiBaseUrl` / `upgradeUrl` / `accountUrl` to **`https://cannabissage.app`** (CWS production). Manifest `host_permissions` includes that origin, **`https://cannabissage.vercel.app/*`** (fallback), plus `http://localhost:3000/*` for unpacked local/dev.

**Local/dev override (pick one):**

1. Unpacked: set `chrome.storage.local.csi_api_base` to `http://localhost:3000` (popup/devtools), or temporarily edit `extension/data/config.json` to localhost before load.
2. Keep `npm run dev` on port 3000; activate/validate then hit your local API.

Optional mock license without Stripe:

```bash
# .env.local
ALLOW_DEV_MOCK=1
curl -X POST http://localhost:3000/api/license/activate \
  -H 'content-type: application/json' \
  -d '{"mock":true}'
```

## Production / Vercel

1. Deploy `web/` to Vercel project **cannabissage** (custom domain `https://cannabissage.app`, alias `https://cannabissage.vercel.app`); Marketplace already attaches Neon (`cannabissage-db`) + Stripe sandbox (`cannabissage-stripe`).
2. Confirm env: `DATABASE_URL` / `POSTGRES_URL`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PROMO`, `STRIPE_PRICE_ID_PROMO_MONTHLY`, `STRIPE_PRICE_ID_REGULAR_ANNUAL`, `STRIPE_PRICE_ID_REGULAR_MONTHLY`, `NEXT_PUBLIC_SITE_URL=https://cannabissage.app`, `LAUNCH_DATE`. Do **not** set `ALLOW_DEV_MOCK` in prod.
3. Point Stripe webhook (test mode until Cipher CLEAR) to `https://cannabissage.app/api/webhook` (Vercel alias URL also works).
4. Extension defaults to `cannabissage.app` in `data/config.json` (v1.3.3+); manifest keeps Vercel + localhost in `host_permissions` for fallback/unpacked dev.
5. Rebuild extension zip (`./scripts/pack-extension.sh`) → `dist/cannabis-sage-1.3.3.zip`.

License rows live in Neon (`licenses`); Stripe subscription metadata remains the entitlement source of truth (`web/lib/licenses.ts`, `web/lib/fulfillment.ts`).

## CWS payment policy notes

- Do **not** embed Stripe Elements or collect PANs in the extension.
- Deep-link **Upgrade** to the website Checkout only.
- Entitlement HTTPS calls to your API are allowed; **no remote code** loading.
- Disclose Stripe + email (Checkout customer email / license association) in `PRIVACY.md` and `STORE_LISTING.md`.

## Testing checklist

- [ ] `npm run smoke` in `web/` (pricing window + license key format)
- [ ] Test-mode Checkout completes (annual **and** monthly) → success page shows `CSG-…` key
- [ ] Webhook writes license; `/api/license/validate` returns `active: true`
- [ ] Extension popup Activate → status Pro; filters unlock on Sunnyside
- [ ] Free plan on Zen Leaf shows multi-store upgrade gate
- [ ] Customer Portal opens from site `/account` or extension Manage
- [ ] Cancel subscription → validate becomes inactive after webhook

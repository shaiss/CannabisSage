# CannabisSage monetization (P3)

Stripe Checkout (hosted) + license keys + extension entitlement. **No card collection inside the Chrome extension** (CWS policy).

## Offer

| Window | Price | Config |
| --- | --- | --- |
| Launch promo (first **30 days** after `LAUNCH_DATE`) | **$10 / year** | `PRICE_PROMO_CENTS=1000`, `STRIPE_PRICE_ID_PROMO` |
| After promo | Same $10/yr by default, or set your own | `PRICE_AFTER_PROMO_CENTS` (display) + optional `STRIPE_PRICE_ID_AFTER_PROMO` |

Defaults in `web/lib/pricing.ts`:

- `LAUNCH_DATE=2026-09-20` (set this to your real CWS/public launch day)
- `PROMO_DAYS=30` → promo ends **2026-10-20** with the default launch date
- Do **not** invent a higher post-promo price in code; leave `PRICE_AFTER_PROMO_CENTS` / after-promo Price ID configurable

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
- **Prod API alias:** `https://cannabissage.vercel.app`
- **APIs:** `/api/checkout`, `/api/webhook`, `/api/license/activate`, `/api/license/validate`, `/api/portal`, `/api/checkout/session`

## Stripe Dashboard setup

1. Create Product **CannabisSage Pro** with a **yearly** recurring Price at **$10** → copy Price ID → `STRIPE_PRICE_ID_PROMO`.
2. (Optional) Create a second yearly Price for post-promo → `STRIPE_PRICE_ID_AFTER_PROMO`.
3. Add webhook endpoint `https://<your-domain>/api/webhook` for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Enable **Customer Portal** (cancel / update payment method).
5. Copy secrets into `web/.env.local` from `web/.env.example` (never commit secrets).

**Tax:** If you charge US/EU customers, review [Stripe Tax for subscriptions](https://docs.stripe.com/billing/taxes/collect-taxes) and register before enabling `automatic_tax` (not enabled by default here).

## Local development

```bash
cd web
cp .env.example .env.local   # fill Stripe test keys + price id
npm install
npm run dev                  # http://localhost:3000

# separate terminal — forward webhooks
stripe listen --forward-to localhost:3000/api/webhook
```

Extension `data/config.json` defaults `apiBaseUrl` to `http://localhost:3000`. Manifest includes `http://localhost:3000/*` host permission for activate/validate.

Optional mock license without Stripe:

```bash
# .env.local
ALLOW_DEV_MOCK=1
curl -X POST http://localhost:3000/api/license/activate \
  -H 'content-type: application/json' \
  -d '{"mock":true}'
```

## Production / Vercel

1. Deploy `web/` to Vercel project **cannabissage** (alias `https://cannabissage.vercel.app`); Marketplace already attaches Neon (`cannabissage-db`) + Stripe sandbox (`cannabissage-stripe`).
2. Confirm env: `DATABASE_URL` / `POSTGRES_URL`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PROMO`, `NEXT_PUBLIC_SITE_URL=https://cannabissage.vercel.app`, `LAUNCH_DATE`. Do **not** set `ALLOW_DEV_MOCK` in prod.
3. Point Stripe webhook (test mode until Cipher CLEAR) to `https://cannabissage.vercel.app/api/webhook`.
4. Update `extension/data/config.json` `apiBaseUrl` / `upgradeUrl` / `accountUrl` to the prod origin.
5. Add that origin to `manifest.json` `host_permissions` (or grant `optional_host_permissions` for `https://*.vercel.app/*` and request at runtime later).
6. Rebuild extension zip (`./scripts/pack-extension.sh`).

License rows live in Neon (`licenses`); Stripe subscription metadata remains the entitlement source of truth (`web/lib/licenses.ts`, `web/lib/fulfillment.ts`).

## CWS payment policy notes

- Do **not** embed Stripe Elements or collect PANs in the extension.
- Deep-link **Upgrade** to the website Checkout only.
- Entitlement HTTPS calls to your API are allowed; **no remote code** loading.
- Disclose Stripe + email (Checkout customer email / license association) in `PRIVACY.md` and `STORE_LISTING.md`.

## Testing checklist

- [ ] `npm run smoke` in `web/` (pricing window + license key format)
- [ ] Test-mode Checkout completes → success page shows `CSG-…` key
- [ ] Webhook writes license; `/api/license/validate` returns `active: true`
- [ ] Extension popup Activate → status Pro; filters unlock on Sunnyside
- [ ] Free plan on Zen Leaf shows multi-store upgrade gate
- [ ] Customer Portal opens from site `/account` or extension Manage
- [ ] Cancel subscription → validate becomes inactive after webhook

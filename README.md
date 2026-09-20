# CannabisSage

Chrome extension (**Manifest V3**, v1.3) that enhances supported dispensary listing and product pages with retailer-published cannabinoid and terpene information, comparison, filters, sorting, and a local taste-map match score. Optional **Pro** unlocks via Stripe Checkout on the website (never inside the extension).

**Stores:** [Sunnyside](https://www.sunnyside.shop) (primary), [Zen Leaf](https://zenleafdispensaries.com) (including Malvern / TerraVida alias). See [`docs/ADAPTERS.md`](docs/ADAPTERS.md).

**Monetization:** [`docs/MONETIZATION.md`](docs/MONETIZATION.md) · landing + API in [`web/`](web/).

> Displays information published by the retailer. **Not medical advice.**

## Install (Chrome — primary)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Open a listing such as [Sunnyside Flower](https://www.sunnyside.shop/products/flower)
5. Toolbar popup: taste map + **Upgrade / Activate license**

### Pack for Chrome Web Store

```bash
./scripts/pack-extension.sh
```

Creates `dist/cannabis-sage-<version>.zip`.

## Features

**Free:** hover tooltips, basic badges, compare tray, PDP panel, Sunnyside.

**Pro (launch promo $9/yr or $4/mo for 30 days after `LAUNCH_DATE`, then $99/yr or $9/mo):** taste-map match, filters/sort, export, deal badges, Zen Leaf + TerraVida multi-store.

**P0–P2:** compare, PDP, badges, TTL cache, taste-map/filters/sort/glossary/export/deals, in-repo store adapters.

**P3:** Stripe Checkout website, webhooks, license keys, extension entitlement gates.

## Architecture

| Piece | Role |
| --- | --- |
| `extension/adapters/*` | Store registry + site-specific parsing |
| `extension/lib/csi-entitlement.js` / `csi-features.js` | License + Free/Pro gates |
| `web/` | Next.js landing, Checkout, webhooks, activate/validate/portal APIs |
| `bridge.js` | MAIN-world React/client props + SPA notify |

## Local web + Stripe test

```bash
cd web && cp .env.example .env.local   # add Stripe test keys + price id
npm install && npm run dev
stripe listen --forward-to localhost:3000/api/webhook
```

Extension defaults to prod API `https://cannabissage.app` (Vercel alias `https://cannabissage.vercel.app` remains in `host_permissions` as fallback). For local entitlement against `npm run dev`, set `chrome.storage.local.csi_api_base` to `http://localhost:3000` (or temporarily edit `extension/data/config.json`).

## Permissions

See [`PRIVACY.md`](PRIVACY.md) and [`STORE_LISTING.md`](STORE_LISTING.md).

## Debugging

```js
localStorage.setItem('cannabisSageDebug', '1');
location.reload();
```

```bash
node scripts/smoke-adapters.mjs
node web/scripts/smoke-monetization.mjs
```

## Manual testing

[`TESTING.md`](TESTING.md)

## License

Personal / educational project. Use at your own discretion and in line with retailer terms and local law.

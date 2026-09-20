# Chrome Web Store Listing — CannabisSage

Use this copy when submitting **v1.3+** to the Chrome Web Store. Keep claims factual; do not imply medical advice or clinical outcomes.

## Store metadata

| Field | Value |
| --- | --- |
| **Name** | CannabisSage |
| **Version** | 1.3.3 |
| **Category** | Shopping (or Productivity) |
| **Language** | English |
| **Single purpose** | Surface cannabinoid/terpene details on supported dispensary listings and product pages; compare and optionally unlock Pro tools (filters, taste-map, multi-store) after website Stripe Checkout. |

## Short description (≤ 132 characters)

```
Chem insights for Sunnyside & Zen Leaf. Free hover/compare; Pro via Stripe on our site. Not medical advice.
```

## Detailed description

```
CannabisSage is a Chrome extension for supported cannabis retailers:

• Sunnyside (sunnyside.shop)
• Zen Leaf Dispensaries (zenleafdispensaries.com)
• TerraVida shopping via Zen Leaf Malvern menus (same Zen Leaf host)

Free features:
• Hover tooltips and basic chem badges
• Compare tray (up to 3 products)
• Product detail panel on Sunnyside

Pro features (unlock after purchase on the CannabisSage website):
• Taste-map match, listing filters & sort
• CSV/JSON export and deal badges
• Zen Leaf / TerraVida multi-store

Payments:
• Subscription checkout uses Stripe Checkout on our website — never inside the extension
• Launch promo: $9/year or $4/month for the first 30 days after launch — then $59/year or $9/month (see cannabissage.app for dates)
• Activate a license key in the extension popup; manage/cancel via Stripe Customer Portal

What it does not do
• Medical advice or claims about effects/dosing/treatment
• Card collection inside the extension
• Remote code / sideloaded plugins

Privacy
• See PRIVACY.md — retailer page reads, optional Stripe email for Pro, on-device storage

Packaging
• Upload the zip from ./scripts/pack-extension.sh
```

## Permission justifications

### Host permission: Sunnyside

Inject UI and fetch same-origin product HTML on Sunnyside listings and PDPs.

### Host permission: Zen Leaf

Inject UI and fetch same-origin product HTML on Zen Leaf location menus/PDPs (including Malvern / TerraVida alias).

### Host permission: CannabisSage site (`https://cannabissage.app/*`, `https://cannabissage.vercel.app/*`)

Call entitlement activate/validate APIs and open Upgrade / Manage links on the production landing origin (`cannabissage.app`; `cannabissage.vercel.app` kept as Vercel fallback). Cards are never entered in the extension.

### Host permission: localhost (unpacked local/dev)

`http://localhost:3000/*` is kept so unpacked loads can talk to a local `web/` server. Production zip defaults (`data/config.json`) point at `https://cannabissage.app`. For local API override without editing the zip: set `chrome.storage.local.csi_api_base` to `http://localhost:3000`.

### Permission: `storage`

Persist compare tray, taste-map prefs, filters, TTL cache, and Pro license entitlement on device.

## Single purpose statement

```
Enhance supported cannabis retailer listing and detail pages by displaying retailer-published cannabinoid and terpene information, enabling comparison of up to three products, and optionally unlocking local Pro tools after a website Stripe subscription. Not medical advice. Payments are not collected inside the extension.
```

## Remote code attestation notes

- All extension logic ships inside the package.
- No eval of remote scripts; adapters are in-repo only.
- Network: retailer HTML fetches + CannabisSage entitlement HTTPS API + user-initiated navigation to Stripe Checkout on the website.

## Human steps remaining

1. Chrome Web Store developer account.
2. Deploy `web/` (Vercel), configure Stripe test→live, webhooks, Customer Portal.
3. Confirm `extension/data/config.json` + manifest hosts for `https://cannabissage.app` and `https://cannabissage.vercel.app` (localhost kept for unpacked local/dev).
4. Upload `dist/cannabis-sage-1.3.3.zip` (CWS **1.3.2** may still be pending review with vercel-only hosts; ship **1.3.3** post-approval or unpacked).
5. Paste copy + permission justifications; host `PRIVACY.md` on HTTPS.
6. Screenshots; privacy questionnaire; submit (age-restricted vertical; no medical claims).

See `docs/MONETIZATION.md` and `docs/ADAPTERS.md`.

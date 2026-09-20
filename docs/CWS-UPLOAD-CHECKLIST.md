# Chrome Web Store upload checklist — CannabisSage v1.3

**For:** Shai / Admiral · **Eng:** Assay · **Product:** Sage · **Security:** Cipher  
**PR:** https://github.com/shaiss/CannabisSage/pull/1 · branch `cursor/chrome-extension-mv3-4eb2`  
**Target day:** 2026-09-20 · **Do not merge** until Cipher CLEAR.  
**Pack:** `dist/cannabis-sage-1.3.2.zip`

**Reminder:** No medical claims, no “effects” language, no remote code, no card collection inside the extension.

---

## Pre-flight verification (2026-09-20)

| Check | Result |
| --- | --- |
| `node scripts/smoke-adapters.mjs` | PASS |
| `node web/scripts/smoke-monetization.mjs` | PASS |
| `cd web && npm run build` | PASS |
| Pack zip + secret scan | PASS — `dist/cannabis-sage-1.3.2.zip`, manifest present, no `sk_`/`whsec_` |
| Browser: flower listing | PASS — filter bar, badges, Compare Select |
| Browser: hover tooltip | PASS — chem profile |
| Browser: persist compare (hard refresh) | PASS — tray count + Selected ✓ (fixed in 1.3.1) |
| Browser: vapes listing | PASS |
| Browser: PDP panel | PASS |

Manual unpacked fallback:

1. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`
2. Hard-refresh after reload (Ctrl+Shift+R)
3. Flower + vapes: badges, hover, Compare Select, persist across refresh
4. Open a `/product/<id>` PDP panel

---

## Admiral / Shai — ship order tomorrow

| # | Owner | Action | Done? |
| --- | --- | --- | --- |
| 1 | **Cipher** | CLEAR security review before merge / first public deploy | ☐ |
| 2 | **Sage** | Accept Free/Pro split, promo copy, store listing tone | ☐ |
| 3 | **Assay / Shai** | Stripe: Product **CannabisSage Pro**, yearly **$10** Price → `STRIPE_PRICE_ID_PROMO`; webhook → `https://<prod>/api/webhook` (`checkout.session.completed`, `customer.subscription.*`); enable Customer Portal | ☐ |
| 4 | **Assay / Shai** | Deploy `web/` to Vercel; set env from `web/.env.example` (never invent keys) | ☐ |
| 5 | **Assay** | Set real `LAUNCH_DATE` (promo = +30 days). Post-promo only via `PRICE_AFTER_PROMO_*` / `STRIPE_PRICE_ID_AFTER_PROMO` when Sage decides | ☐ |
| 6 | **Assay** | ✅ Prod API wired in **1.3.2** — `config.json` → `https://cannabissage.vercel.app`; manifest `host_permissions` includes that origin (+ localhost for unpacked local/dev). Re-pack zip after any further change | ☑ |
| 7 | **Shai** | Upload **`dist/cannabis-sage-1.3.2.zip`** to Chrome Web Store | ☐ |
| 8 | **Shai** | Paste copy + permission justifications from [`STORE_LISTING.md`](../STORE_LISTING.md) | ☐ |
| 9 | **Shai** | Host [`PRIVACY.md`](../PRIVACY.md) on HTTPS; link in CWS listing | ☐ |
| 10 | **Shai** | Screenshots **1280×800** and **640×400** (listing + PDP + popup; optional Zen Leaf) | ☐ |
| 11 | **Shai** | Privacy practices questionnaire (on-device storage; Stripe only for Pro checkout on website) | ☐ |
| 12 | **Shai** | Submit for review (age-restricted retail; single purpose; **no medical claims**) | ☐ |

---

## Pack commands

```bash
./scripts/pack-extension.sh
# → dist/cannabis-sage-1.3.2.zip

node scripts/smoke-adapters.mjs
node web/scripts/smoke-monetization.mjs
```

## Related docs

- [`HANDOFF-ASSAY.md`](HANDOFF-ASSAY.md) — eng take-over  
- [`MONETIZATION.md`](MONETIZATION.md) — Stripe / promo window  
- [`ADAPTERS.md`](ADAPTERS.md) — store adapters  
- [`STORE_LISTING.md`](../STORE_LISTING.md) · [`PRIVACY.md`](../PRIVACY.md)

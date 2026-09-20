# Assay handoff — CannabisSage → CWS 2026-09-20

**Eng delivery (Portfolio SA):** Assay  
**Product:** Sage (PM)  
**Security before merge / first public ship:** Cipher CLEAR required — do not merge without it  
**PR:** https://github.com/shaiss/CannabisSage/pull/1 · branch `cursor/chrome-extension-mv3-4eb2`  
**Target:** Chrome Web Store readiness **2026-09-20**

**Admiral upload checklist:** [`CWS-UPLOAD-CHECKLIST.md`](CWS-UPLOAD-CHECKLIST.md)

## Status (shipped on PR #1)

| Phase | Status | Where |
| --- | --- | --- |
| P0 | Done | Persist compare, PDP, badges, 6h TTL cache, `/products/*`, empty/error UX, `TESTING.md` |
| P1 | Done | Taste-map + popup, filters/sort, glossary, CSV/JSON export, deal/$/mg |
| P2 | Done | `extension/adapters/*`, Sunnyside / Zen Leaf / TerraVida(Malvern), `docs/ADAPTERS.md` |
| P3 | Done (code + stubs) | `web/` Next.js + Stripe Checkout + license APIs, extension entitlement, `docs/MONETIZATION.md` |

Version: **extension 1.3.3** · Pack: `./scripts/pack-extension.sh` → `dist/cannabis-sage-1.3.3.zip`

## Feature gates (Pro)

Free: hover, basic badges, compare, PDP, Sunnyside.  
Pro: taste-map on listings, filters/sort, export, deal badges, Zen Leaf + TerraVida.  
Tweak: `extension/lib/csi-features.js` (+ landing copy in `web/lib/pricing-public.ts`).

## Assay take-over checklist (human / SA)

1. **Cipher CLEAR** — security review before merge or first public deploy (test-mode Stripe only until CLEAR).
2. **Stack flip-in (Neon + Checkout)** — durable licenses on Neon via `DATABASE_URL`; hosted Checkout `$10/yr` promo via `STRIPE_PRICE_ID_PROMO` + `LAUNCH_DATE`. Schema: `web/db/migrations/001_licenses.sql`. CRUD stays in `web/lib/licenses.ts`.
3. **Stripe (test → live after Cipher)** — Product “CannabisSage Pro”, yearly $10 Price → `STRIPE_PRICE_ID_PROMO`; webhook → `/api/webhook`; Customer Portal on. See `docs/MONETIZATION.md`.
4. **Deploy `web/`** to Vercel project `cannabissage` (`https://cannabissage.app`, alias `https://cannabissage.vercel.app`); set env from `web/.env.example` (never commit secrets; no `ALLOW_DEV_MOCK` in prod).
5. **Set `LAUNCH_DATE`** to real public/CWS day (promo = +30 days). `PRICE_AFTER_PROMO_*` only when Sage decides post-promo price — do not invent a higher amount.
6. **Point extension at prod API** — ✅ **1.3.3**: `extension/data/config.json` → `https://cannabissage.app`; manifest includes `cannabissage.app` + `cannabissage.vercel.app` (+ localhost for unpacked local/dev). CWS **1.3.2** pending with vercel-only hosts. Override local API via `csi_api_base` storage or temporary config edit.
7. **CWS upload** — zip from pack script; copy from `STORE_LISTING.md`; host `PRIVACY.md` on HTTPS; screenshots; age-restricted vertical; no medical claims.
8. **Sage product sign-off** — Free/Pro split, promo copy, store listing tone.

### SA-CLEAR path (this flip-in)

1. `cd web && npm ci && npm run smoke && npm run typecheck && npm run build`
2. Confirm Vercel env has Neon `DATABASE_URL` + Stripe **test** keys + `STRIPE_PRICE_ID_PROMO` (no live keys until Cipher).
3. Optional: `SMOKE_LIVE=1` only with `sk_test_` + `DATABASE_URL`.
4. Cipher reviews webhook signature verify, no secrets in repo, fail-closed without DB, no extension card collection.

## Verify quickly

```bash
node scripts/smoke-adapters.mjs
node web/scripts/smoke-monetization.mjs
cd web && npm ci && npm run build
./scripts/pack-extension.sh
```

Manual matrix: `TESTING.md` (incl. Stripe test-mode section).

## Constraints (do not regress)

- No medical / effects claims in UI or store copy  
- No remote code loaders / eval of network JS  
- No card collection inside the extension (Stripe Checkout on site only)  
- Host permissions only for verified ecommerce + entitlement API origins  

## Out of scope for this PR

Live Stripe keys, production Vercel project ownership, CWS developer account payment, Cipher merge approval.

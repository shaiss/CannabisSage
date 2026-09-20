# CannabisSage — Manual Test Matrix (v1.3)

Load unpacked from `extension/` after each change. Debug logs stay off unless `localStorage.cannabisSageDebug='1'`.

Automated checks:

```bash
node scripts/smoke-adapters.mjs
node web/scripts/smoke-monetization.mjs
```

## Setup

> After reloading the unpacked extension, hard-refresh (Ctrl+Shift+R) or open a new tab. Otherwise Chrome shows “Extension context invalidated” and UI may collapse.

1. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`
2. Open popup via toolbar icon; confirm taste-map editor loads with seeded defaults
3. Confirm service worker link has no errors
4. Filter bar title should show the active store (e.g. `CannabisSage · Sunnyside`)

## Sunnyside — category listings

For each URL, confirm badges, Compare Select, filter bar, and hover tooltip:

| Category | URL | Pass? | Notes |
| --- | --- | --- | --- |
| Flower | https://www.sunnyside.shop/products/flower | | |
| Vapes | https://www.sunnyside.shop/products/vapes | | |
| Concentrates | https://www.sunnyside.shop/products/concentrates | | |
| Edibles / caps | https://www.sunnyside.shop/products/edibles (or capsules / troches as redirected by state) | | |

Checks per listing:

- [ ] Filter bar visible; title includes **Sunnyside**
- [ ] Cards show **top-terp badge** when we have terp data (Sunnyside already shows THC/CBD on-card — no duplicate cann badges)
- [ ] Hover shows loading → profile or clear empty/error message (never silent)
- [ ] “Map match” appears when score ≥ threshold
- [ ] Sale / `$/mg` badges only when DOM provides sale cues and weight+price+THC

## Sunnyside — product detail (PDP)

| Step | Pass? |
| --- | --- |
| Open any `/product/<id>` from a listing | |
| **No** CannabisSage chem block in the size/quantity / buy column — chem only in the **floating** right-side panel | |
| PDP panel appears with chem readout or empty/error state | |
| Tap a terpene → glossary note + disclaimer | |
| **Add to compare** updates persistent tray | |

## Zen Leaf — smoke

| Step | URL / action | Pass? |
| --- | --- | --- |
| Malvern medical menu listing | https://zenleafdispensaries.com/locations/malvern/medical-menu/menu | |
| Filter bar shows **TerraVida (Zen Leaf Malvern)** (Malvern uses TerraVida alias) | | |
| Cards enhance with THC badge from on-card ranges | | |
| Compare Select + hover tooltip | | |
| Open a product PDP from a card (`.../menu/<category>/<slug>`) | | |
| PDP panel loads chem / empty / error (never silent) | | |
| Non-Malvern Zen Leaf (e.g. Abington) shows **Zen Leaf** in filter title | https://zenleafdispensaries.com/locations/abington/medical-menu/menu | |

## TerraVida — findings check

| Step | Pass? |
| --- | --- |
| Extension does **not** inject on `terravidahc.com` (no host permission; not a catalog) | |
| Shopping Malvern on Zen Leaf host activates TerraVida alias adapter | |

## Compare tray persistence

| Step | Pass? |
| --- | --- |
| Select 2 products → tray shows Compare (2) | |
| Hard refresh listing → selection still present; buttons show Selected | |
| SPA navigate within store → selection survives | |
| **Clear** empties tray and resets buttons | |
| Sidebar **JSON** / **CSV** copies to clipboard | |

## Filters & sort

| Step | Pass? |
| --- | --- |
| Min THC filters out lower cards | |
| Must-include terpene keeps only matching cards | |
| Exclude terpene hides matching cards | |
| Max $/mg filters when $/mg is known | |
| Sort by THCA / total terps / match score reorders visible cards | |
| Reset restores default order/visibility | |

## Taste map (popup)

| Step | Pass? |
| --- | --- |
| Defaults favor limonene / terpinolene / myrcene / linalool (shopping prefs seed) | |
| Change preferred weights → Save | |
| Reload listing → match badges update | |
| Reset defaults restores seeded JSON prefs | |

## Deals

| Step | Pass? |
| --- | --- |
| Product with strikethrough/sale UI shows **Sale** badge when detectable | |
| Zen Leaf “% Off” / Currently $ shows Sale | |
| `$/mg` appears only with scrapeable price + weight + THC | |

## SPA / scroll

| Step | Pass? |
| --- | --- |
| Infinite scroll / “load more” / pagination enhances new cards | |
| Client-side category change re-enhances without clearing compare | |

## Permissions / hygiene

| Step | Pass? |
| --- | --- |
| No console spam without debug flag | |
| `./scripts/pack-extension.sh` builds `dist/cannabis-sage-1.3.4.zip` | |
| Zip contains `adapters/*`, `lib/csi-entitlement.js`, manifest, popup/*, data/*, icons | |
| No secrets in package | |
| `node scripts/smoke-adapters.mjs` exits 0 | |
| `node web/scripts/smoke-monetization.mjs` exits 0 | |

## P3 — Monetization (Stripe test mode)

Prereq: `cd web && npm i && npm run dev` with `.env.local` Stripe test keys; `stripe listen --forward-to localhost:3000/api/webhook`.

| Step | Pass? |
| --- | --- |
| Landing `/` shows promo price + Free vs Pro | |
| Checkout button redirects to Stripe Checkout (hosted) | |
| Success page shows `CSG-…` license key | |
| Popup → Activate license → status Pro | |
| Sunnyside: filters unlock; Free shows Upgrade on filter bar | |
| Zen Leaf without Pro: multi-store gate banner | |
| Zen Leaf with Pro: TerraVida/Zen Leaf enhancements work | |
| Manage → Customer Portal (test) | |
| Cancel sub → webhook → validate inactive → Pro features lock | |

## Explicitly out of scope (do not fail v1.3)

- Wishlist / tried tags beyond taste prefs
- Strain lineage deep features
- Remote / sideloaded community adapters (in-repo PRs only)
- Live-mode Stripe until human goes live

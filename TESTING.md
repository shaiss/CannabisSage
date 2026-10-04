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
- [ ] **What CannabisSage adds** chip is present **once** in the filter bar (not repeated on each card). One line: chem badges, cannabinoids, primary terps, and compare. Expand is optional, does not name the retailer, and says retailer titles stay on the menu
- [ ] Free plan still shows the chip; chem badges and compare are not hidden behind Pro. No extra Upgrade button inside the chip (existing filter-bar Upgrade stays)
- [ ] Cards show **top-terp badge** when we have terp data (Sunnyside already shows THC/CBD on-card — no duplicate cann badges)
- [ ] Hover shows loading → listed chemistry or clear empty/error message (never silent)
- [ ] “Map match” appears when score ≥ threshold
- [ ] Sale / `$/mg` badges only when DOM provides sale cues and weight+price+THC

## Sunnyside — product detail (PDP)

| Step | Pass? |
| --- | --- |
| Open any `/product/<id>` from a listing | |
| **No** CannabisSage chem block in the size/quantity / buy column — chem only in the **floating** right-side panel | |
| Floating panel **header** shows the same **what CannabisSage adds** chip (loading and loaded). Expand stays calm; no retailer name; no new Pro button | |
| PDP panel appears with chem readout or empty/error state | |
| Preference match, when taste-map is on and chem overlaps saved prefs (see v1.3.11). Otherwise the panel stays quiet | |
| Nearby chem on this menu: up to 3 same-host neighbors from cached listed chem, or a calm “not enough” note (see v1.3.15) | |
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
| Sidebar shows **Terpene overlap** above the chem table (free; no Upgrade control) | |

## Terpene overlap (v1.3.8+)

Compare stays free. Overlap copy must not name a retailer or make medical/effects claims. Missing chemistry stays quiet — no red error banner, no page URLs.

| Step | Pass? |
| --- | --- |
| Two picks that share a named terpene list it under **Shared**; a terpene on only one pick is **Only on one** | |
| Three picks: a terpene on two of them shows under **On some** (not Shared) | |
| No named terpenes (or total-only) → calm note, no chip list | |
| One pick, or a failed load that leaves fewer than two → calm note, not an error banner | |
| A failed pick is left out of Shared; note says overlap uses the picks that loaded | |
| Terpene names in the overlap block still open the glossary note | |
| Free plan shows overlap. Export stays the existing Pro control; overlap adds none | |

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
| **Below median** only when this card’s price and a category median from at least 3 listed prices are both real (see v1.3.9) | |

## Deal vs category median (v1.3.9+)

Deal flags stay Pro (`dealBadges`), same as Sale and `$/mg` on listings. Chemistry badges, hover, compare, and the PDP panel stay on Free — this does not add an upgrade wall when the median is missing.

The flag is **Below median**. It uses the listed price on the card and the median of listed prices in that category on this menu. A category page (for example `/products/flower`) is one category. A mixed menu only groups cards whose product URL names a category. Fewer than 3 scraped prices, a missing price, or a price that is not under the median: show nothing. No guessed price, no percent-off, no error banner.

The product page reuses a median saved from a listing on the same host within 2 hours, and only when this product’s category is known (from its URL, or because the listing saved that URL). Otherwise the PDP stays quiet.

Copy must not name a retailer or make medical or effects claims.

| Step | Pass? |
| --- | --- |
| Pro, category listing with 3+ scraped prices: a card under the median shows **Below median** | |
| Card with no price, or a category with fewer than 3 prices: no median badge and no error | |
| Price equal to or above the median: no median badge | |
| Free plan: no **Below median** badge. THC/terp badges and compare still show. No new Upgrade control for the missing flag | |
| Pro, open that product after the listing: deals row shows the same badge plus “Below the median listed price in this category.” | |
| PDP opened with no saved median for that category: no badge and no strip | |
| Badge and strip do not name a retailer or make medical/effects claims | |

## Provenance strip (v1.3.10+)

The floating product panel shows source, lab, and date only when the menu payload has them. A missing part is left out. If none of the three is present, the strip is not rendered — no placeholder, no guessed lab, no guessed date.

What the adapters actually expose:

- Sunnyside inventory can include a menu-source id (`source_sku`) and a packaged date (`mfg_date`). It does not include a lab name. Relative “ago” text and an expiration date are not shown.
- Zen Leaf `labTests` on the menu is potency only. A THC/THCA label is not a lab. An image URL is not a menu source. A promo start date is not a timestamp. A lab name or tested date appears only when that field is on the payload.

Listing cards add a quiet line under the chem badges only when a lab label or a date is present. A menu-source id by itself stays on the product panel so the grid does not grow a line on every card. This is free, same as the chem panel. Copy says “Menu source”, “Lab”, “Tested”, or “Packaged” — it does not name a retailer or make a medical or effects claim.

| Step | Pass? |
| --- | --- |
| PDP with a menu-source id: floating panel shows **Menu source** plus that id. No retailer name in the line | |
| PDP with a lab name on the payload: line includes **Lab** and that name | |
| PDP with a test date: line says **Tested** and the date. A packaged/mfg date says **Packaged**, not Tested | |
| PDP whose payload has none of those fields: no provenance strip and no empty “unknown lab” text | |
| THC/THCA potency label, image URL, promo dates, and “2 days ago” do not become provenance | |
| Listing with a lab or a date: one quiet line under the badges, not a new colored badge | |
| Listing with only a menu-source id: no extra line on the card. The id still shows on the product panel | |
| Strip and listing line do not name a retailer or make medical/effects claims | |

## Preference match on the product page (v1.3.11+)

The floating product panel shows a preference match when taste-map is already allowed for this plan and the saved prefs share a named terpene with the product. Prefs are the popup taste map. If nothing has been saved, the panel uses `extension/data/default-taste-map.json`. Clearing every preferred row and saving counts as no prefs.

Nothing is rendered when there are no preferred terpenes, when none of those names are listed on the product, or when the score is under the saved minimum. A total-terpene number by itself is not overlap. There is no “no match” line and no Upgrade button for the missing panel. Chemistry, compare, and the rest of the product panel stay as they are.

The gate is the existing `tasteMap` feature, the same one as “Map match” on listing cards. It is Pro today. This does not add a second lock. If taste-map is enabled for the plan, the match shows; if it is not, the panel is omitted.

Copy says “Preference match” and lists the preferred terpenes in this listed chem. It does not name a retailer or make a medical or effects claim. An avoid name appears only when that terpene is listed on the product.

| Step | Pass? |
| --- | --- |
| Taste-map allowed, product lists a preferred terpene at or above the saved minimum: chip plus those terpene names inside the floating panel | |
| Nothing saved yet: seeded default prefs are used (same names as the popup before the first Save) | |
| Preferred list saved empty, or no preferred name on the product: no chip, no empty note | |
| Score under the saved minimum: no chip | |
| Total terpenes only, no named overlap: no chip | |
| Taste-map not enabled (Free, while taste-map stays Pro): no chip and no new Upgrade control. Chem and compare still show | |
| Chip and terpene names do not name a retailer or make medical/effects claims | |
| Chem stays in the floating panel, not the buy column | |

## Soft Pro unlock mid-browse (v1.3.12+)

Free listings that already show chemistry can offer one quiet note. It is not a wall. Badges, hover, Compare Select, and the product panel stay usable while it is on screen. It does not appear on the product page.

The note waits until you have scrolled the menu (or hovered a card) and at least three cards have finished chemistry badges — not a lone “Loading…” chip. Fewer than three ready cards stays quiet. Pro never sees it. A store that is already behind the multi-store gate does not also show this note.

**Upgrade** uses the same control as the filter-bar Upgrade: it opens `https://cannabissage.app/#pricing`, where Stripe Checkout runs on the site. The extension does not collect a card. **Not now** removes the note and stores `csi_soft_unlock_dismissed` in extension storage so it stays hidden after reload. Clear that key to see the note again.

Copy says taste-map match and $/mg stay optional, and that chemistry and compare stay on the page. It does not name a retailer or make a medical or effects claim.

| Step | Pass? |
| --- | --- |
| Free listing, no scroll or hover yet: no note, chem badges and Compare Select still appear | |
| After scroll or hover, once three cards have chemistry (not only Loading): one note, bottom-left, not covering the compare tray | |
| Note visible: hover still opens the chem tooltip; Compare Select still works; product page chem panel still opens | |
| Upgrade opens cannabissage.app pricing (hosted checkout), not a card form in the extension | |
| Not now hides the note; reload the listing and it stays hidden | |
| Pro: no note | |
| Menu with fewer than three chem-ready cards: no note | |
| Store behind the multi-store gate: existing gate only, no second note | |
| Note copy does not name a retailer or make medical/effects claims | |

## SPA / scroll

| Step | Pass? |
| --- | --- |
| Infinite scroll / “load more” / pagination enhances new cards | |
| Client-side category change re-enhances without clearing compare | |

## Permissions / hygiene

| Step | Pass? |
| --- | --- |
| No console spam without debug flag | |
| `./scripts/pack-extension.sh` builds `dist/cannabis-sage-1.3.16.zip` | |
| Zip contains `adapters/*`, `lib/csi-entitlement.js`, manifest, popup/*, data/*, icons | |
| No secrets in package | |
| `node scripts/smoke-adapters.mjs` exits 0 | |
| `node scripts/smoke-partners.mjs` exits 0 | |
| `node web/scripts/smoke-monetization.mjs` exits 0 | |

## Similar-by-chem (v1.3.15+)

Same-menu neighbors on the **floating PDP** only. Ranked from retailer-published cannabinoids and terpenes already in the 6-hour product cache (typically after browsing a listing). No extra catalog scrape, no invented lab numbers, no strain-name medical framing. Chem labels are primary; product name is secondary.

Free, like compare overlap. Missing cache or too few neighbors: one calm note — not an error banner and not an Upgrade wall. Core PDP chem stays visible.

| Step | Pass? |
| --- | --- |
| Browse a category listing until several cards have chem, then open a PDP | |
| Panel shows **Nearby chem on this menu** with at most 3 rows | |
| Each row leads with listed terp/THC, not the strain name; name if shown is quieter | |
| Shared named terpenes are listed when they overlap | |
| Neighbor links stay on this store host | |
| Open a PDP with no prior listing cache: calm “not enough listed chemistry” note, no red error | |
| Product with no published chem: existing empty state only — no neighbor list | |
| Free plan shows neighbors. No new Upgrade control on the similar block | |
| Copy does not name a retailer or make medical/effects claims | |
| `node scripts/smoke-adapters.mjs` exits 0 | |

## Chem-over-strain (v1.3.16+)

Sage-added copy and labels lead with listed chemistry (cannabinoids, primary terps, chem similarity). Retailer product titles stay on the store page; when Sage repeats a name (compare columns, similar-by-chem rows) it is quieter than the chem lead. No invented lab numbers. No medical / effects claims. Free chem view is unchanged.

| Step | Pass? |
| --- | --- |
| Listing chip summary names cannabinoids / primary terps / compare, not “strain” | |
| Hover loading says **Loading listed chemistry…** (not “profile”) | |
| Listing badges still lead with THC / top terp; retailer card title is untouched | |
| PDP loading / empty / error use listed-chemistry wording; panel body is chem readout | |
| Similar-by-chem rows still lead with terp/THC; name stays secondary | |
| Compare sidebar title is **Chem comparison**; column headers lead with chem, name quieter | |
| Compare overlap “only on one” labels use chem lead, not the strain name | |
| Copy does not name a retailer or make medical/effects claims | |
| `node scripts/smoke-adapters.mjs` exits 0 | |

## What CannabisSage adds (v1.3.7+)

One calm chip, free and Pro. Copy must not name a retailer or make medical/effects claims.

| Step | Pass? |
| --- | --- |
| Listing: chip once in the filter bar, next to the title — not on every badge row | |
| PDP: chip inside the floating panel header (not the buy column) | |
| Expand mentions listed cannabinoids, primary terps, compare, and optional Pro tools; chemistry still visible on Free | |
| Chip has no Upgrade control (soft Pro line only). Existing Upgrade on the Free filter bar is unchanged | |

## Remote denylist (v1.3.6+)

| Step | Pass? |
| --- | --- |
| `https://cannabissage.app/denylist.json` (or local `web/public/denylist.json`) is `{ version, hosts: [] }` by default | |
| Adding a host → calm notice “Support for this store is paused.”; no badges/compare inject | |
| Manifest `host_permissions` for retailer hosts unchanged | |
| Ops notes in `docs/DENYLIST.md` | |

## Partner registry / Supported landing (v1.3.13+)

Public list of supported hosts. Not adapter display names. Denylist wins.

| Step | Pass? |
| --- | --- |
| `https://cannabissage.app/partners.json` (or local `web/public/partners.json`) is `{ version, partners: [...] }` | |
| Seeds are `community` (Sunnyside + Zen Leaf hosts); no verified badge on landing | |
| Host on `denylist.json` does not appear under Supported even if registry says community/verified | |
| Registry `denied` rows omitted | |
| TerraVida/Malvern is not a separate invented hostname | |
| Ops notes in `docs/PARTNERS.md` | |
| `node scripts/smoke-partners.mjs` exits 0 | |

## In-page partner chrome (v1.3.14)

Extension fetches `/partners.json` (same origin/TTL as denylist). Calm chip on listing + PDP only.

| Step | Pass? |
| --- | --- |
| Seed hosts show **Community adapter** + registry `displayName` (Sunnyside / Zen Leaf), not Verified | |
| Chip sits in the listing filter bar and PDP header — not on every product card | |
| Chip uses registry `displayName`, not adapter `displayName` (Malvern still labeled Zen Leaf) | |
| Host on denylist: pause notice only; no partner/Supported/verified/community chip | |
| Missing or invalid `partners.json`: no chip; listing/PDP otherwise continue | |
| No DNS TXT or `/.well-known` fetch | |
| `node scripts/smoke-partners.mjs` exits 0 | |

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

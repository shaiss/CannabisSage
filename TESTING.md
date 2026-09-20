# CannabisSage — Manual Test Matrix (v1.1)

Load unpacked from `extension/` after each change. Debug logs stay off unless `localStorage.cannabisSageDebug='1'`.

## Setup

1. `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`
2. Open popup via toolbar icon; confirm taste-map editor loads
3. Confirm service worker link has no errors

## Category listings

For each URL, confirm badges, Compare Select, filter bar, and hover tooltip:

| Category | URL | Pass? | Notes |
| --- | --- | --- | --- |
| Flower | https://www.sunnyside.shop/products/flower | | |
| Vapes | https://www.sunnyside.shop/products/vapes | | |
| Concentrates | https://www.sunnyside.shop/products/concentrates | | |
| Edibles / caps | https://www.sunnyside.shop/products/edibles (or capsules / troches as redirected by state) | | |

Checks per listing:

- [ ] Filter bar visible at top
- [ ] Cards show THC% and/or top-terp badge (or explicit “No chem data” / “Chem unavailable”)
- [ ] Hover shows loading → profile or clear empty/error message (never silent)
- [ ] “Map match” appears when score ≥ threshold
- [ ] Sale / `$/mg` badges only when DOM provides sale cues and weight+price+THC

## Product detail (PDP)

| Step | Pass? |
| --- | --- |
| Open any `/product/<id>` from a listing | |
| PDP panel appears with chem readout or empty/error state | |
| Tap a terpene → glossary note + disclaimer | |
| **Add to compare** updates persistent tray | |

## Compare tray persistence

| Step | Pass? |
| --- | --- |
| Select 2 products → tray shows Compare (2) | |
| Hard refresh listing → selection still present; buttons show Selected | |
| SPA navigate flower → vapes → selection survives | |
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
| Change preferred weights → Save | |
| Reload listing → match badges update | |
| Reset defaults restores seeded JSON prefs | |

## Deals

| Step | Pass? |
| --- | --- |
| Product with strikethrough/sale UI shows **Sale** badge when detectable | |
| `$/mg` appears only with scrapeable price + weight + THC | |

## SPA / scroll

| Step | Pass? |
| --- | --- |
| Infinite scroll / “load more” enhances new cards | |
| Client-side category change re-enhances without clearing compare | |

## Permissions / hygiene

| Step | Pass? |
| --- | --- |
| No console spam without debug flag | |
| `./scripts/pack-extension.sh` builds `dist/cannabis-sage-1.1.0.zip` | |
| Zip contains manifest, lib/*, popup/*, data/*, icons | |
| No secrets in package | |

## Explicitly out of scope (do not fail v1)

- TerraVida / Zen Leaf
- Wishlist / tried tags beyond taste prefs
- Strain lineage deep features

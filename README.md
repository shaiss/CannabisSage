# CannabisSage

Chrome extension (**Manifest V3**, v1.1) that enhances [Sunnyside](https://www.sunnyside.shop) product listing and detail pages with retailer-published cannabinoid and terpene information, comparison, filters, sorting, and a local taste-map match score.

> Displays information published by Sunnyside. **Not medical advice.** Aroma glossary notes are factual associations only; individual experiences vary.

## Install (Chrome — primary)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Open a listing such as [Flower](https://www.sunnyside.shop/products/flower), [Vapes](https://www.sunnyside.shop/products/vapes), or a product detail URL
5. Optional: click the toolbar icon to edit your **taste map**

### Pack for Chrome Web Store

```bash
./scripts/pack-extension.sh
```

Creates `dist/cannabis-sage-<version>.zip`.

## Features (v1.1)

**P0**

- Persistent compare tray (up to 3) with clear-all; survives refresh and SPA navigation
- Product detail (PDP) side panel
- Listing badges: THC%, top terpene, loading/empty/error states
- TTL cache for fetched product profiles (6 hours)
- Category coverage via `/products/*` (flower, vapes, concentrates, edibles, etc.)
- Explicit empty/error UX (never silent failure)

**P1**

- Taste-map match scoring + “Map match” badge; popup editor for preferences
- Listing filters: min THC, must-include/exclude terpene, max $/mg when calculable
- Sort overlays: THCA/THC, total terpenes, match score
- Terpene glossary (tap → one-line aroma note + disclaimer)
- Export compare set as CSV or JSON (clipboard)
- Deal awareness: sale flag and $/mg when price + weight + THC are available in the DOM

**Deferred (P2):** other retailers, wishlist/tried tags, deep strain lineage.

## Architecture

| Piece | Role |
| --- | --- |
| `bridge.js` (MAIN world) | Read React product props; price/sale/weight hints |
| `lib/csi-*.js` | Shared parse, storage, fetch+cache, glossary, UI |
| `content-listing.js` / `content-pdp.js` | Listing + PDP controllers |
| `content-router.js` | SPA-aware route switch between listing and PDP |
| `background.js` | Allowed-host product HTML fetch; cache prune |
| `popup/` | Taste-map preference editor |
| `data/` | Default taste map + terpene glossary JSON |

Product fetches use `chrome.runtime` messaging (no Tampermonkey / no remote code).

## Permissions

| Declaration | Purpose |
| --- | --- |
| Host `sunnyside.shop` | Listings, PDPs, same-site detail HTML |
| `storage` | Compare tray, prefs, filters, TTL cache |

See [`PRIVACY.md`](PRIVACY.md) and [`STORE_LISTING.md`](STORE_LISTING.md).

## Debugging

Default: quiet console. Enable:

```js
localStorage.setItem('cannabisSageDebug', '1');
location.reload();
```

## Manual testing

See [`TESTING.md`](TESTING.md) for the full matrix (categories, PDP, persist, filters, sort, taste-map, export, deals, SPA).

## Screenshots

Reference images under [`screenshots/`](screenshots/) from earlier UX. Resize to CWS sizes before store upload.

## Legacy

Former Tampermonkey userscripts live under [`legacy/`](legacy/) (unsupported).

## License

Personal / educational project. Use at your own discretion and in line with Sunnyside’s terms and local law.

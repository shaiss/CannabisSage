# CannabisSage

Chrome extension (**Manifest V3**, v1.2) that enhances supported dispensary listing and product pages with retailer-published cannabinoid and terpene information, comparison, filters, sorting, and a local taste-map match score.

**Stores:** [Sunnyside](https://www.sunnyside.shop) (primary), [Zen Leaf](https://zenleafdispensaries.com) (including Malvern / TerraVida alias). See [`docs/ADAPTERS.md`](docs/ADAPTERS.md).

> Displays information published by the retailer. **Not medical advice.** Aroma glossary notes are factual associations only; individual experiences vary.

## Install (Chrome — primary)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Open a listing such as [Sunnyside Flower](https://www.sunnyside.shop/products/flower) or [Zen Leaf Malvern menu](https://zenleafdispensaries.com/locations/malvern/medical-menu/menu)
5. Optional: click the toolbar icon to edit your **taste map**

### Pack for Chrome Web Store

```bash
./scripts/pack-extension.sh
```

Creates `dist/cannabis-sage-<version>.zip`.

## Features (v1.2)

**P0**

- Persistent compare tray (up to 3) with clear-all; survives refresh and SPA navigation
- Product detail (PDP) side panel
- Listing badges: THC%, top terpene, loading/empty/error states
- TTL cache for fetched product profiles (6 hours)
- Explicit empty/error UX (never silent failure)

**P1**

- Taste-map match scoring + “Map match” badge; popup editor for preferences
- Listing filters: min THC, must-include/exclude terpene, max $/mg when calculable
- Sort overlays: THCA/THC, total terpenes, match score
- Terpene glossary (tap → one-line aroma note + disclaimer)
- Export compare set as CSV or JSON (clipboard)
- Deal awareness: sale flag and $/mg when price + weight + THC are available in the DOM

**P2**

- In-repo store adapter plugin system (no remote code)
- Built-in adapters: Sunnyside, Zen Leaf, TerraVida (Zen Leaf Malvern alias)
- Contributor guide: [`docs/ADAPTERS.md`](docs/ADAPTERS.md)

## Architecture

| Piece | Role |
| --- | --- |
| `adapters/*` | Store registry + site-specific DOM/URL/chem parsing |
| `bridge.js` (MAIN world) | React/client product props; SPA route notify |
| `lib/csi-*.js` | Shared parse, storage, fetch+cache, glossary, UI |
| `content-listing.js` / `content-pdp.js` | Listing + PDP controllers (adapter-driven) |
| `content-router.js` | SPA-aware route switch via `adapter.routeMode` |
| `background.js` | Allowed-host product HTML fetch; cache prune |
| `popup/` | Taste-map preference editor |
| `data/` | Default taste map + terpene glossary JSON |

Product fetches use `chrome.runtime` messaging (no Tampermonkey / no remote code).

## Permissions

| Declaration | Purpose |
| --- | --- |
| Host `sunnyside.shop` | Sunnyside listings, PDPs, same-site detail HTML |
| Host `zenleafdispensaries.com` | Zen Leaf / Malvern (TerraVida alias) menus + PDPs |
| `storage` | Compare tray, prefs, filters, TTL cache |

See [`PRIVACY.md`](PRIVACY.md) and [`STORE_LISTING.md`](STORE_LISTING.md).

## Debugging

Default: quiet console. Enable:

```js
localStorage.setItem('cannabisSageDebug', '1');
location.reload();
```

Adapter unit smoke (no browser):

```bash
node scripts/smoke-adapters.mjs
```

## Manual testing

See [`TESTING.md`](TESTING.md) for the full matrix (Sunnyside, Zen Leaf, TerraVida alias, PDP, persist, filters, sort, taste-map, export, deals, SPA).

## Screenshots

Reference images under [`screenshots/`](screenshots/) from earlier UX. Resize to CWS sizes before store upload.

## Legacy

Former Tampermonkey userscripts live under [`legacy/`](legacy/) (unsupported).

## License

Personal / educational project. Use at your own discretion and in line with retailer terms and local law.

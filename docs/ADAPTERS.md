# Store adapters — CannabisSage

CannabisSage supports multiple retailers through **in-repo store adapters**. Core owns UI (tooltips, badges, compare tray, filters, sort, taste-map, export). Adapters own site-specific URL matching, DOM selectors, and chem parsing only.

**Remote code is not supported.** Chrome Web Store policy forbids loading extension logic from the network. New stores ship as PRs that add files under `extension/adapters/` and update the manifest.

Ops can **pause** a host without a rebuild via HTTPS denylist JSON (config only) — see [`docs/DENYLIST.md`](DENYLIST.md).

## Layout

| File | Role |
| --- | --- |
| `extension/adapters/interface.js` | Contract helpers + required field list |
| `extension/adapters/registry.js` | Built-in registry + `getActiveAdapter()` |
| `extension/adapters/sunnyside.js` | Primary adapter |
| `extension/adapters/zenleaf.js` | Zen Leaf Dispensaries (`zenleafdispensaries.com`) |
| `extension/adapters/terravida.js` | TerraVida alias for Zen Leaf **Malvern** only |
| `extension/adapters/_template.js` | Copy-paste starter (not registered) |

Registry order (first match wins): `terravida` → `zenleaf` → `sunnyside`.

## Adapter interface

Each adapter is a plain object with at least:

| Field | Purpose |
| --- | --- |
| `id` | Stable kebab-case id |
| `displayName` | Shown in filter bar |
| `matchHosts` / `matchPatterns` | Documented hosts for CWS |
| `matchesUrl(url)` | Whether this adapter owns the page |
| `routeMode(pathname)` | `'listing'` \| `'pdp'` \| `null` |
| `listingSelectors` / `pdpSelectors` | Primary CSS hooks |
| `findProductCards` / `isLikelyProductCard` / `cardHost` | Listing DOM |
| `resolveProductUrlFromDom` / `buildProductUrl` | PDP URLs |
| `parseProductHtml(html, url)` | Chem scrape from fetched PDP HTML |
| `parseListingHints(cardEl)` *(optional)* | On-card price/sale/THC |
| `isAllowedFetchUrl(url)` | Background fetch allowlist mirror |
| `bridgeStrategy` | `'sunnyside'` \| `'zenleaf'` \| `'none'` |

### Provenance

The floating product panel shows a provenance strip only for fields the active adapter actually parsed. Anything missing is omitted — the strip is not rendered at all when source, lab, and timestamp are all absent.

| Payload field | Shown as | Where it exists today |
| --- | --- | --- |
| `source_sku` or `menuSource` | Menu source | Sunnyside inventory. Not an image `sourceUrl`, not the retailer name. |
| `labName` / `laboratory` / `labTests.labName` | Lab | Only when that key is present. Zen Leaf `displayThc.label` (`THC` / `THCA`) is potency, not a lab. |
| `testedAt` (and `testDate` / `labTestedAt`) | Tested YYYY-MM-DD | Only a real calendar date. |
| `mfg_date` / `packagedAt` | Packaged YYYY-MM-DD | Sunnyside manufacturing date. Not `exp_date`, not promo `startDate`, not `updated_ago`. |

Listing cards repeat that line only when a lab label or a date is present, as quiet text under the chem badges. A menu-source id alone stays on the product panel so the grid does not grow a line on every card.

## Built-in stores

### Sunnyside (primary)

- Hosts: `www.sunnyside.shop`, `sunnyside.shop`
- Listing: `/products/*` · PDP: `/product/<id>`
- Bridge: React fiber product props

### Zen Leaf

- Hosts: `zenleafdispensaries.com`, `www.zenleafdispensaries.com`
- Listing: `/locations/:slug/(medical\|recreational)-menu/menu` or `/locations/:slug/menu`
- PDP: `.../menu/:category/:product-slug`
- Cards: `[data-testid="product-card"]` with on-card `THC` / `TERP` ranges
- Order email domain (informational): `orders-pa@zenleafdispensaries.com`

### TerraVida — verified findings

| Candidate | Result |
| --- | --- |
| `terravidahc.com` | Squarespace marketing site; `/menu` does **not** serve a product catalog (redirects away). **Not** added to `host_permissions`. |
| `terravida.com` | Redirects to an unrelated third-party site. |
| Zen Leaf Malvern | Live ecommerce: `https://zenleafdispensaries.com/locations/malvern/...` |

The `terravida` adapter therefore **aliases Zen Leaf Malvern paths only** (display name `TerraVida (Zen Leaf Malvern)`), reusing Zen Leaf DOM/HTML parsers. No invented hostnames.

## How to add a store (community PR)

1. Copy `extension/adapters/_template.js` → `extension/adapters/<id>.js`.
2. Implement the interface against **real** menu/PDP URLs (document what you verified).
3. Register the id in `BUILTIN_ORDER` in `registry.js` (put more specific matchers first).
4. Extend `extension/manifest.json`:
   - `content_scripts[].matches` (listing + PDP globs)
   - `host_permissions` (only hosts you fetch/inject on)
   - `web_accessible_resources[].matches` if popup/data URLs are read from those origins
5. Mirror PDP allow rules in `extension/background.js` `ALLOWED_FETCH_RULES`.
6. If React/client state differs, extend `bridge.js` with a new `bridgeStrategy`.
7. Justify each host in `STORE_LISTING.md` and `PRIVACY.md`.
8. Add smoke rows to `TESTING.md`.
9. **Do not** add a remote plugin loader.

### CWS host permission note

Every new ecommerce hostname requires an **extension update** (and typically a CWS review) when declared in `host_permissions`. An optional future pattern is `optional_host_permissions` + `chrome.permissions.request` so users grant hosts at runtime; this repo currently uses static `host_permissions` for clarity.

## Core wiring

Content script load order (isolated world):

`csi-core` → `adapters/interface` → store adapters → `registry` → `csi-storage` / `csi-fetch` / UI → listing / PDP / router

`CSI.registry.getActiveAdapter()` drives route mode, card discovery, HTML parse, and bridge strategy.

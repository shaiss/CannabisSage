# Store adapters — CannabisSage

CannabisSage supports multiple retailers through **in-repo store adapters**. Core owns UI (tooltips, badges, compare tray, filters, sort, taste-map, export). Adapters own site-specific URL matching, DOM selectors, and chem parsing only.

**Remote code is not supported.** Chrome Web Store policy forbids loading extension logic from the network. New stores ship as PRs that add files under `extension/adapters/` and update the manifest.

Ops can **pause** a host without a rebuild via HTTPS denylist JSON (config only) — see [`docs/DENYLIST.md`](DENYLIST.md). The landing **Supported** list and in-page community/verified chips come from a separate HTTPS JSON registry keyed by hostname — see [`docs/PARTNERS.md`](PARTNERS.md). Never treat adapter `displayName` as the public list or as partner chrome.

## Layout

| File | Role |
| --- | --- |
| `extension/adapters/interface.js` | Contract helpers + required field list |
| `extension/adapters/registry.js` | Built-in registry + `getActiveAdapter()` |
| `extension/adapters/sunnyside.js` | Primary adapter |
| `extension/adapters/zenleaf.js` | Zen Leaf Dispensaries (`zenleafdispensaries.com`) |
| `extension/adapters/terravida.js` | TerraVida alias for Zen Leaf **Malvern** only |
| `extension/adapters/iheartjane.js` | Multi-tenant iHeartJane (first host: RISE / `risecannabis.com`) |
| `extension/adapters/dutchie.js` | Multi-tenant Dutchie embed (`dutchie.com/embedded-menu/…`) |
| `extension/adapters/_template.js` | Copy-paste starter (not registered) |

Registry order (first match wins): `terravida` → `zenleaf` → `iheartjane` → `dutchie` → `sunnyside`.

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
| `bridgeStrategy` | `'sunnyside'` \| `'zenleaf'` \| `'dutchie'` \| `'none'` (HTML-parse hosts; skip fiber bridge) |

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

### iHeartJane (RISE first host) — verified findings

| Item | Result |
| --- | --- |
| Host | `risecannabis.com` / `www.risecannabis.com` (Next.js storefront; Jane-powered menu) |
| Listing | `/dispensaries/:state/:slug/:storeId/(medical\|recreational)-menu/` |
| PDP | `.../medical-menu/product/:productId/:slug/` |
| Cards | `article[data-testid^="product-card-"]` with `product-card-potency-*` = `Total THC XX.XX%` |
| Chem source | Same-origin PDP HTML / Next.js flight payload: `percentThc`, `inventoryPotencies[].thc_potency`, terpene percents in `productDescription` (`Name: 0.418% \| ...`) |
| Bridge | `none` (HTML parse; no React fiber strategy) |
| First store | RISE King of Prussia medical menu (`.../king-of-prussia/1552/medical-menu/`). Sibling PA RISE location paths match the same patterns. |
| Follow-up | Beyond Hello is a later Wave 1 host — extend `HOSTS` / labels, do not hard-code KoP only. |

### Dutchie (multi-tenant)

- Hosts: `dutchie.com` / `www.dutchie.com` (embedded menu iframe) plus retailer entry shells when verified
- First verified tenant: **Liberty Norristown**
  - Entry: `https://libertycannabis.com/shop/norristown/` (thin WordPress + `dutchie--embed__script`; **top-frame only**)
  - Live menu: `https://dutchie.com/embedded-menu/liberty-norristown/products/…` (**`all_frames: true` only here**)
  - PDP: `https://dutchie.com/embedded-menu/liberty-norristown/product/:slug`
  - Manifest split: Sunnyside / Zen Leaf / RISE / Liberty stay top-frame; only Dutchie `/embedded-menu/*` uses `all_frames`
- Cards: `[data-testid="product-list-item"]` with on-card `THC:` / `TERPS:` (CBD when present)
- Listing chem is **filter-bar ready** for THC and total terpenes; **named terpene %** appear on PDP panels (listing GraphQL `terpenes` / `terpenesV2` are null)
- Bridge: `dutchie` (live DOM scrape; background HTML fetch may hit Cloudflare)
- New tenants: add slug → display name in `VERIFIED_SLUGS` (and optional retailer shop path map). Do not open all of `dutchie.com`.

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

## Cross-store cache (v1.3.17+)

The 6-hour PDP TTL cache is shared across built-in adapters. Listing and PDP writes may include price, package size, category, and `adapterId` so a product page can rank **soft matches at other stores you already opened**. TerraVida vs Zen Leaf share `zenleafdispensaries.com` but use different adapter ids (Malvern paths vs other locations).

This does **not** add hosts, scrape a second catalog, or load remote adapters. If the shopper has never opened another supported store in this TTL window, the PDP shows a quiet empty note.

### Store switcher (v1.3.18)

Pro (`multiStore`) only. Match rows with an allowlisted cached URL get an **Open on {store}** control (new tab) to that store’s own product page. When two or more other stores have allowlisted destinations, a compact chip strip lists them. URLs must be http(s) and resolve to a built-in adapter; anything else is dropped. Free keeps the soft Upgrade note — no switcher chrome.

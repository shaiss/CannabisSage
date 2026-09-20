# Privacy Policy — CannabisSage

**Last updated:** September 20, 2026  
**Extension version covered:** 1.1.x

CannabisSage is a Chrome extension that helps shoppers view cannabinoid and terpene information on [Sunnyside](https://www.sunnyside.shop) product listing and detail pages, compare a small number of products, filter/sort visible cards, and score products against a local taste preference map.

## Summary

CannabisSage does **not** collect, sell, or share personal data with the extension developer. It does not require an account. It does not use analytics SDKs, advertising trackers, or remote configuration that executes code.

## Data the extension accesses

When you use CannabisSage on supported Sunnyside pages:

1. **Page content (local):** The content script reads product card and detail-page information already present in the page (identifiers, names, prices, sale cues, and any potency/terpene fields exposed in the DOM or client state).
2. **Product detail pages (network):** The background service worker may request Sunnyside product detail HTML over HTTPS (`https://www.sunnyside.shop/product/<id>`) when listing cards lack chemistry details or when you open a detail page / comparison.
3. **Local extension storage (`chrome.storage.local`):**
   - Compare-tray selections (up to three products and related profile fields)
   - Taste-map preferences you set in the toolbar popup
   - Listing filter/sort preferences
   - A short-lived **TTL cache** of fetched product profiles (default 6 hours) to reduce repeat network requests
4. **Bundled JSON:** Default taste-map seeds and a terpene aroma glossary ship inside the extension package.

## Data we do not collect

CannabisSage does **not**:

- Create user accounts or store Sunnyside login credentials
- Transmit browsing history, selections, or taste preferences to the developer or any third party other than Sunnyside hosts you already use
- Upload data to an analytics or advertising service
- Sell or rent user data
- Execute remote code

## Permissions explained

| Permission / host | Why it is needed |
| --- | --- |
| Host access to `https://www.sunnyside.shop/*` (and apex `sunnyside.shop`) | Inject UI on `/products/*` listings and `/product/*` detail pages; fetch same-site product HTML for chemistry details. |
| `storage` | Persist compare selections, taste-map preferences, filter/sort settings, and TTL product-profile cache on your device. |
| No `tabs`, `history`, `cookies`, identity, or `<all_urls>` | Intentionally omitted. |

## Third parties

Network requests go only to Sunnyside hosts (`sunnyside.shop`). CannabisSage does not introduce additional third-party data processors.

## Children

CannabisSage is not directed at children. Cannabis product browsing is subject to applicable age and jurisdiction restrictions on the retailer site.

## Changes

If this privacy policy changes in a material way, the “Last updated” date above will be revised and the store listing / repository copy will be updated.

## Contact

For privacy questions, open an issue on the public repository: [https://github.com/shaiss/CannabisSage](https://github.com/shaiss/CannabisSage).

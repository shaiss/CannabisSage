# Privacy Policy — CannabisSage

**Last updated:** September 20, 2026

CannabisSage is a Chrome extension that helps shoppers view cannabinoid and terpene information on [Sunnyside](https://www.sunnyside.shop) product listing pages and compare a small number of products side by side.

## Summary

CannabisSage does **not** collect, sell, or share personal data. It does not require an account. It does not use analytics SDKs, advertising trackers, or remote configuration that executes code.

## Data the extension accesses

When you use CannabisSage on a supported Sunnyside listing page (`https://www.sunnyside.shop/products/...`):

1. **Page content (local):** The content script reads product card information already present in the page (for example product identifiers, names, and any potency data exposed in the page DOM / client state) in order to show tooltips and comparison UI.
2. **Product detail pages (network):** To fill in missing details, the extension’s background service worker may request the corresponding Sunnyside product detail page over HTTPS (for example `https://www.sunnyside.shop/product/<id>`). That request is made only for products you hover or select for comparison.
3. **In-memory selection state:** Up to three product URLs and related profile fields may be kept in memory while the listing tab is open so comparison works. This state is not written to cloud storage and is cleared when you leave the listing navigation context or close the tab.

## Data we do not collect

CannabisSage does **not**:

- Create user accounts or store login credentials
- Transmit browsing history to the developer or any third party
- Upload product selections or profiles to an external server controlled by CannabisSage
- Use cookies for tracking across sites
- Sell or rent user data
- Execute remote code

## Permissions explained

| Permission / host | Why it is needed |
| --- | --- |
| Host access to `https://www.sunnyside.shop/*` (and apex `sunnyside.shop`) | Inject UI on product listing pages and fetch product detail HTML for the same site when cannabinoid/terpene fields are missing from the listing card. |
| No `storage`, `tabs`, `history`, `cookies`, or broad `<all_urls>` permissions | Intentionally omitted to keep the extension’s privilege surface minimal. |

## Third parties

Network requests go only to Sunnyside hosts you are already browsing (`sunnyside.shop`). CannabisSage does not introduce additional third-party data processors.

## Children

CannabisSage is not directed at children. Cannabis product browsing is subject to applicable age and jurisdiction restrictions on the retailer site.

## Changes

If this privacy policy changes in a material way, the “Last updated” date above will be revised and the store listing / repository copy will be updated.

## Contact

For privacy questions about this extension, open an issue on the public repository: [https://github.com/shaiss/CannabisSage](https://github.com/shaiss/CannabisSage).

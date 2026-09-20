# Chrome Web Store Listing — CannabisSage

Use this copy when submitting the extension to the Chrome Web Store. Keep claims factual; do not imply medical advice or clinical outcomes.

## Store metadata

| Field | Value |
| --- | --- |
| **Name** | CannabisSage |
| **Version** | 1.0.0 |
| **Category** | Shopping (or Productivity) |
| **Language** | English |
| **Single purpose** | Show cannabinoid and terpene details on Sunnyside product listings and compare up to three products. |

## Short description (≤ 132 characters)

```
Hover for cannabinoid & terpene profiles on Sunnyside listings. Select up to 3 products to compare side by side.
```

(Character count: 112)

## Detailed description

```
CannabisSage is a Chrome extension for Sunnyside (sunnyside.shop) product listing pages.

What it does
• Hover a product card to see cannabinoid percentages (such as THC, THCA, CBD, CBDA when listed) and terpene details when available.
• Select up to three products and open a side-by-side comparison sidebar.
• Fetches missing details from the matching Sunnyside product page when the listing card does not already expose them.

What it does not do
• It does not provide medical advice or make claims about effects, dosing, or treatment.
• It does not replace official product labels, certificates of analysis, or in-store guidance.
• It does not expand to unrelated retailers in this release.

Privacy
• No account required.
• No analytics SDK and no remote code execution.
• Requests stay on sunnyside.shop hosts you are already using.
• See PRIVACY.md in the project repository for the full privacy policy.

Supported pages
• https://www.sunnyside.shop/products/* listing pages

How to use
1. Open a Sunnyside category listing (for example Flower or Vapes).
2. Hover a product card to view available profile details.
3. Click Select on up to three products, then Compare.

Notes
• Product data depends on what Sunnyside publishes on listing and detail pages. Some items may omit terpene breakdowns or individual cannabinoids.
• If Sunnyside changes its page structure, selectors may need an update.
• Lab results and displayed percentages can vary by batch and location; treat on-page figures as retailer-provided information.
```

## Permission justifications (CWS form)

### Host permission: `https://www.sunnyside.shop/*` and `https://sunnyside.shop/*`

**Justification:** CannabisSage only works on Sunnyside ecommerce pages. The content script runs on `/products/*` listing URLs to attach hover tooltips and selection controls. The background service worker fetches same-origin product detail pages (`/product/<id>`) when listing cards do not already include cannabinoid or terpene fields needed for tooltips and comparison. No other sites are accessed.

### Why no additional permissions

The extension does not request `storage`, `tabs`, `cookies`, `history`, `identity`, or `<all_urls>`. That keeps the declared capability limited to reading/enhancing Sunnyside pages the user opens.

## Single purpose statement

```
Enhance Sunnyside cannabis product listing pages by displaying available cannabinoid and terpene information on hover and allowing side-by-side comparison of up to three selected products.
```

## Remote code / data usage attestation notes

- All extension logic ships inside the package (`content.js`, `background.js`, CSS, icons).
- No eval of remote scripts; no dynamically loaded extension code from the network.
- Network use is limited to HTTPS fetches of Sunnyside HTML for product details the user interacts with.

## Screenshots required by Chrome Web Store

Prepare at least one screenshot in each required size (store rules may require both):

| Size | Suggested content |
| --- | --- |
| **1280 × 800** | Listing page with hover tooltip showing cannabinoids/terpenes |
| **640 × 400** | Same tooltip, or comparison sidebar with 2–3 products |

Existing repository images under `screenshots/` are useful references but may need resizing/cropping to exact CWS dimensions before upload.

Optional promotional tile (if requested by the form): 440 × 280.

## Store icon

Upload the 128×128 icon from `extension/icons/icon128.png` (also provide 16 and 48 if the form asks separately; they are included in the package).

## Packaging

From the repo root:

```bash
./scripts/pack-extension.sh
```

This writes `dist/cannabis-sage-<version>.zip` containing only the `extension/` payload (manifest, scripts, CSS, icons). Upload that zip in the Chrome Web Store developer dashboard.

## Human steps remaining after this PR

1. Create / pay for a Chrome Web Store developer account (one-time registration fee; currently $5 USD — confirm on Google’s developer site).
2. Create a new item, upload the zip from `scripts/pack-extension.sh`.
3. Paste the short/detailed descriptions and permission justifications from this file.
4. Link or paste the privacy policy (`PRIVACY.md` hosted on GitHub Pages / raw GitHub URL, or your own HTTPS page).
5. Upload compliant screenshots (1280×800 and 640×400).
6. Complete the privacy practices questionnaire (no user data collection / no selling data).
7. Submit for review and respond to any CWS policy feedback (age-restricted vertical, accurate single-purpose, minimal permissions).

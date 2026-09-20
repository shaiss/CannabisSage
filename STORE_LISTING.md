# Chrome Web Store Listing — CannabisSage

Use this copy when submitting **v1.1+** to the Chrome Web Store. Keep claims factual; do not imply medical advice or clinical outcomes.

## Store metadata

| Field | Value |
| --- | --- |
| **Name** | CannabisSage |
| **Version** | 1.1.0 |
| **Category** | Shopping (or Productivity) |
| **Language** | English |
| **Single purpose** | Surface cannabinoid/terpene details on Sunnyside listings and product pages; compare, filter, sort, and match against a local taste preference map. |

## Short description (≤ 132 characters)

```
Sunnyside chem insights: hover badges, compare tray, filters, taste-map match. Local prefs only. Not medical advice.
```

## Detailed description

```
CannabisSage is a Chrome extension for Sunnyside (sunnyside.shop).

On category listings (flower, vapes, concentrates, edibles, and related categories):
• Hover a product card for cannabinoid and terpene details when the retailer publishes them
• See small badges (THC%, top terpene, sale, optional $/mg when price and weight are visible)
• Select up to three products in a persistent compare tray (survives refresh)
• Filter by min THC, must-include/exclude terpene, and max $/mg when calculable
• Sort visible cards by THCA/THC, total terpenes, or taste-map match
• Flag products that match your local taste preference map

On product detail pages:
• Side panel with the same chemistry readout
• Add to the compare tray
• Tap a terpene for a one-line aroma note plus a disclaimer (not medical advice)

Taste map:
• Edit preferred/avoided terpenes in the extension popup
• Preferences stay on your device

What it does not do
• It does not provide medical advice or make claims about effects, dosing, or treatment
• It does not replace official labels, certificates of analysis, or in-store guidance
• It does not support other retailers in this version

Privacy
• No account required
• No analytics SDK and no remote code execution
• Network requests stay on sunnyside.shop
• Uses on-device storage for compare selections, preferences, and a short TTL cache
• See PRIVACY.md in the project repository

Packaging
• Upload the zip from ./scripts/pack-extension.sh
```

## Permission justifications

### Host permission: `https://www.sunnyside.shop/*` and `https://sunnyside.shop/*`

Needed to run on Sunnyside listing and product detail pages and to fetch same-origin product HTML when chemistry fields are missing from listing cards.

### Permission: `storage`

Needed to persist the compare tray, taste-map preferences, listing filter/sort settings, and a time-limited product-profile cache on the user’s device. Data is not uploaded to the developer.

## Single purpose statement

```
Enhance Sunnyside cannabis product listing and detail pages by displaying retailer-published cannabinoid and terpene information, enabling comparison of up to three products, and providing local filter/sort/taste-map tools. Not medical advice.
```

## Remote code attestation notes

- All logic ships inside the package (content scripts, service worker, popup, bundled JSON).
- No eval of remote scripts; no dynamically loaded extension code from the network.
- Network use is limited to HTTPS fetches of Sunnyside HTML for products the user views or compares.

## Screenshots

Prepare **1280×800** and **640×400** shots showing: listing badges + filter bar; hover tooltip; compare sidebar; PDP panel; taste-map popup.

## Packaging

```bash
./scripts/pack-extension.sh
```

Writes `dist/cannabis-sage-<version>.zip`.

## Human steps remaining

1. Chrome Web Store developer account (one-time registration fee; confirm current amount on Google’s site).
2. Upload the packed zip.
3. Paste descriptions and permission justifications from this file.
4. Host/link `PRIVACY.md` over HTTPS.
5. Upload compliant screenshots.
6. Complete privacy practices questionnaire (on-device storage only; no selling data).
7. Submit for review (age-restricted retail vertical; accurate single-purpose; no medical claims).

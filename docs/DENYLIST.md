# Remote store denylist (ops)

CannabisSage can pause enhancement on specific retailer **hosts** without shipping a new extension build. The list is plain HTTPS JSON — **not** remote code. The extension never `eval`s or executes anything from the network.

## Endpoint

Production (default):

```
https://cannabissage.app/denylist.json
```

Served from `web/public/denylist.json` on the CannabisSage Vercel site. Override for local testing via `chrome.storage.local.csi_api_base` (same as entitlement) or `extension/data/config.json` → `denylistPath` (default `/denylist.json`).

## Schema

```json
{
  "version": 1,
  "updatedAt": "2026-09-20T00:00:00.000Z",
  "hosts": ["example-retailer.shop", "www.other-menu.com"]
}
```

| Field | Rules |
| --- | --- |
| `version` | Integer schema version (currently `1`) |
| `updatedAt` | ISO-8601 timestamp (informational) |
| `hosts` | Array of hostnames only. `www.` is normalized. Matching is exact on the normalized host (no wildcards, no paths, no JS). |

Unknown fields are ignored. Invalid payloads are rejected; the extension keeps the last-known-good cache.

## Behavior in the extension

1. Background service worker fetches the JSON on a short TTL (~15 minutes).
2. Result is cached in `chrome.storage.local` (`csi_denylist`).
3. If the current page host is listed: **no** listing/PDP inject; calm notice: “Support for this store is paused.”
4. **Fail-open to last-known-good:** network/parse failures reuse the cached list when present; if there is no cache, enhancement continues (empty deny set).
5. Product HTML fetches for denied hosts are also blocked in the service worker.

## How ops updates the list

1. Edit `web/public/denylist.json` (add/remove hostnames).
2. Deploy `web/` to Vercel (production alias `cannabissage.app`).
3. Within ~15 minutes (or sooner after extension restart / cold SW), clients pick up the change.

Optional later: serve the same JSON from Vercel Edge Config behind a tiny read-only API route — keep the response shape identical so the extension does not need a code change.

## Privacy / CWS notes

- Host permissions for retailer origins remain declared (required for pages where support is *not* paused).
- Denylist fetch uses the existing CannabisSage site host permission.
- See `PRIVACY.md` — denylist is configuration data only, not executable code.

## Legal copy

TODO(legal): tone pass on the in-page pause notice (“Support for this store is paused.”).

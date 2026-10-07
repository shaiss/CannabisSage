# Partner registry (ops)

CannabisSage publishes which **hosts** are supported from a plain HTTPS JSON file — the same config plane as the denylist. The file is **not** remote code. The extension never `eval`s or executes anything from the network. Store adapters stay **in-package**.

The list is keyed by **hostname**, not display brand. Ops owns `displayName`. Do not scrape a retailer name into this file. In-page partner chrome uses this `displayName` only — never an adapter `displayName`.

## Endpoint

Production (default):

```
https://cannabissage.app/partners.json
```

Served from `web/public/partners.json` on the CannabisSage Vercel site. Filename is **`partners.json`** (not `supported.json`). Override for local testing via `extension/data/config.json` → `partnersPath` (default `/partners.json`) or `chrome.storage.local.csi_api_base` (same API origin as the denylist).

v1.3.14: the extension **fetches** this file and may show calm in-page **community** / **verified** chrome on listing + PDP. DNS TXT and `/.well-known` proofs remain **docs-only** (not implemented).

## Schema

```json
{
  "version": 1,
  "updatedAt": "2026-10-04T00:00:00.000Z",
  "partners": [
    {
      "host": "sunnyside.shop",
      "status": "community",
      "displayName": "Sunnyside"
    }
  ]
}
```

| Field | Rules |
| --- | --- |
| `version` | Integer schema version (currently `1`) |
| `updatedAt` | ISO-8601 timestamp (informational) |
| `partners[].host` | Hostname only. `www.` is stripped (same `normalizeHost` as [`docs/DENYLIST.md`](DENYLIST.md)). Exact match on the normalized host — no wildcards, no paths. |
| `partners[].status` | `verified` \| `community` \| `denied` |
| `partners[].displayName` | Ops-controlled label shown on the landing and in-page partner chrome. Never taken from adapter `displayName` alone. |
| `partners[].notes` | Optional ops note (e.g. path aliases on the same host). |

Unknown fields are ignored. Duplicate hosts after `www.` normalization: **first row wins**. Invalid rows are skipped.

## Status

| Status | Landing | Extension (listing + PDP) |
| --- | --- | --- |
| `community` | Listed. Quiet “Community adapter” label. No verified badge. | Same quiet chip using registry `displayName`. |
| `verified` | Listed. Verified badge. First wave is **manual** (partner outreach + human check). Do not mark verified without that check. | Same calm “Verified” chip — only when this file says `verified`. |
| `denied` | **Omitted** from Supported. | No partner chrome. |

**Denylist wins:** if the normalized host is on `web/public/denylist.json`, omit it from Supported and show **no** in-page partner chrome even when this registry says `verified` or `community`. A paused host still gets the denylist notice, not a Supported badge.

The landing **Supported** section renders **only** from this registry. Built-in adapters are not a listing source.

## Behavior in the extension (v1.3.14)

1. Background service worker fetches the JSON on the same TTL as the denylist (~15 minutes). Cache key: `chrome.storage.local` → `csi_partners`. Last-known-good is usable for 7 days.
2. Content scripts look up the **current page host** (normalized, `www.` stripped). Listing filter bar and PDP panel may show one small chip. Product cards do not.
3. **Quiet miss:** missing, HTTP error, or invalid `partners.json` → no chip (same calm posture as a denylist miss). Enhancement otherwise continues.
4. Config data only. No remote adapters, no `eval`, no `.well-known` or DNS lookup.

## First wave (manual / community)

Seeded hosts match real in-repo adapter hosts (normalized, no `www.`):

| Host | Display name | Status | Notes |
| --- | --- | --- | --- |
| `sunnyside.shop` | Sunnyside | `community` | Adapter hosts: `www.sunnyside.shop`, `sunnyside.shop` |
| `zenleafdispensaries.com` | Zen Leaf | `community` | Adapter hosts: `zenleafdispensaries.com`, `www.zenleafdispensaries.com`. TerraVida/Malvern is a **path alias** on this host (`/locations/malvern/…`), not a separate ecommerce hostname. Do not add `terravidahc.com` or `terravida.com`. |
| `risecannabis.com` | RISE | `community` | iHeartJane-powered menus under `/dispensaries/.../(medical\|recreational)-menu/`. Adapter id `iheartjane`. |

Do not invent partner verification proofs. GitHub release tags (after an adapter is vendored into the zip) are community **adapter** provenance, not brand proof by themselves. Seeds stay `community` until ops flips a host after a human check.

## Later proof (docs only — not implemented)

Pluggable levels for a future PR:

1. **Manual** (this wave) — partner reaches out → human check → flip `verified`.
2. **DNS / `.well-known`** — TXT record or `/.well-known/cannabissage.json` with an issued nonce. **Do not implement DNS lookup or well-known fetch in this registry version.**
3. **GitHub release tag** — community adapter provenance after we vendor the file; still not brand proof alone.

## How ops updates the list

1. Edit `web/public/partners.json` (add/remove hosts, change `status` / `displayName`).
2. Deploy `web/` to Vercel (production alias `cannabissage.app`).
3. The landing reads the JSON at build/request time. The extension picks up the file on its ~15 minute TTL (or sooner after restart / cold SW). Pause a store immediately by adding the host to `denylist.json` (denylist wins) — see [`docs/DENYLIST.md`](DENYLIST.md).

## Privacy / CWS notes

- Configuration data only, never executable code.
- Adapters remain in `extension/adapters/`. No remote plugin loader.
- See `PRIVACY.md`.

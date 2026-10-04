# Partner registry (ops)

CannabisSage publishes which **hosts** are supported on the landing page from a plain HTTPS JSON file — the same config plane as the denylist. The file is **not** remote code. The extension never `eval`s or executes anything from the network. Store adapters stay **in-package**.

The list is keyed by **hostname**, not display brand. Ops owns `displayName`. Do not scrape a retailer name into this file.

## Endpoint

Production (default):

```
https://cannabissage.app/partners.json
```

Served from `web/public/partners.json` on the CannabisSage Vercel site. Filename is **`partners.json`** (not `supported.json`). Override for local testing via `extension/data/config.json` → `partnersPath` (default `/partners.json`) once the extension fetches this file. v1.3.13 records the path only — fetch and in-page verified badges are later work.

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
| `partners[].displayName` | Ops-controlled label shown on the landing. Never taken from adapter `displayName` alone. |
| `partners[].notes` | Optional ops note (e.g. path aliases on the same host). |

Unknown fields are ignored. Duplicate hosts after `www.` normalization: **first row wins**. Invalid rows are skipped.

## Status

| Status | Landing |
| --- | --- |
| `community` | Listed. Quiet “Community adapter” label. No verified badge. |
| `verified` | Listed. Verified badge. First wave is **manual** (partner outreach + human check). Do not mark verified without that check. |
| `denied` | **Omitted** from Supported. |

**Denylist wins:** if the normalized host is on `web/public/denylist.json`, omit it from Supported even when this registry says `verified` or `community`.

The landing **Supported** section renders **only** from this registry. Built-in adapters are not a listing source.

## First wave (manual / community)

Seeded hosts match real in-repo adapter hosts (normalized, no `www.`):

| Host | Display name | Status | Notes |
| --- | --- | --- | --- |
| `sunnyside.shop` | Sunnyside | `community` | Adapter hosts: `www.sunnyside.shop`, `sunnyside.shop` |
| `zenleafdispensaries.com` | Zen Leaf | `community` | Adapter hosts: `zenleafdispensaries.com`, `www.zenleafdispensaries.com`. TerraVida/Malvern is a **path alias** on this host (`/locations/malvern/…`), not a separate ecommerce hostname. Do not add `terravidahc.com` or `terravida.com`. |

Do not invent partner verification proofs. GitHub release tags (after an adapter is vendored into the zip) are community **adapter** provenance, not brand proof by themselves.

## Later proof (docs only — not implemented)

Pluggable levels for a future PR:

1. **Manual** (this wave) — partner reaches out → human check → flip `verified`.
2. **DNS / `.well-known`** — TXT record or `/.well-known/cannabissage.json` with an issued nonce. **Do not implement DNS lookup or well-known fetch in this registry version.**
3. **GitHub release tag** — community adapter provenance after we vendor the file; still not brand proof alone.

## How ops updates the list

1. Edit `web/public/partners.json` (add/remove hosts, change `status` / `displayName`).
2. Deploy `web/` to Vercel (production alias `cannabissage.app`).
3. The landing reads the JSON at build/request time. Pause a store immediately by adding the host to `denylist.json` (denylist wins) — see [`docs/DENYLIST.md`](DENYLIST.md).

## Privacy / CWS notes

- Configuration data only, never executable code.
- Adapters remain in `extension/adapters/`. No remote plugin loader.
- See `PRIVACY.md`.

# Chrome Web Store publishing (GitHub Actions)

Automated pack + upload/submit for the MV3 extension in `extension/`, via [`.github/workflows/cws-publish.yml`](../.github/workflows/cws-publish.yml) and [`publish-browser-extension` v6.2.0](https://github.com/aklinker1/publish-browser-extension) (Chrome Web Store API **v2**, **service-account** auth).

Official references:

- [Authenticate with a service account](https://developer.chrome.com/docs/webstore/service-accounts)
- [Using the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)

The workflow is **inert** until the repo secrets below are set.

---

## One-time owner setup

1. **GCP project + Chrome Web Store API**  
   In Google Cloud Console, enable the **Chrome Web Store API** for a project you control.

2. **Service account + JSON key**  
   Create a service account in that project and download a JSON key. You need:
   - `client_email` (e.g. `cws-publisher@PROJECT.iam.gserviceaccount.com`)
   - `private_key` (PEM, including newlines)

3. **Authorize the service account in CWS**  
   In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Account** settings, add the service-account email so it can act on your publisher account. See [service accounts](https://developer.chrome.com/docs/webstore/service-accounts).

4. **Copy IDs**  
   - **Publisher ID** — Developer Dashboard account settings  
   - **Extension ID** — the item’s ID in the Dashboard (also in the store URL)

5. **Add GitHub Actions secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `CWS_EXTENSION_ID` | Chrome Web Store extension ID |
   | `CWS_PUBLISHER_ID` | CWS publisher / account ID |
   | `CWS_SERVICE_ACCOUNT_EMAIL` | Service account `client_email` |
   | `CWS_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account `private_key` (full PEM; multiline OK) |

   The workflow maps these to `publish-browser-extension` env vars: `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`.

If any secret is missing, the job fails with a clear list of names.

---

## How to release

1. Bump `"version"` in `extension/manifest.json` (do not invent versions in CI).
2. Commit and merge as usual.
3. Tag and push:

   ```bash
   git tag "v$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")"
   git push origin "v$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")"
   ```

   Example for `1.3.20`: `git tag v1.3.20 && git push origin v1.3.20`.

4. On tag push matching `v*`, the workflow:
   - Fails if the tag is not exactly `v` + manifest version
   - Runs `./scripts/pack-extension.sh` → `dist/cannabis-sage-<version>.zip`
   - Uploads and **submits for review** via CWS API v2

Pack locally anytime: `./scripts/pack-extension.sh`.

---

## Manual / dry-run runs

**Actions → Chrome Web Store Publish → Run workflow**

| Input | Meaning |
| --- | --- |
| `mode` = `submit-for-review` (default) | Upload zip and submit for review |
| `mode` = `upload-only` | Upload only (`--chrome-skip-submit-review`) |
| `dry_run` = true | Auth check only; no upload or submit (`--dry-run`) |

Use `dry_run` after adding secrets to confirm service-account auth before a real publish.

---

## What stays manual in the Dashboard

API publishing updates the **package** only. Still manage in the Developer Dashboard:

- Listing text / descriptions / promotional copy  
- Screenshots and store images  
- Privacy practices questionnaire  
- Visibility, distribution, and age / category settings  

See also [`CWS-UPLOAD-CHECKLIST.md`](CWS-UPLOAD-CHECKLIST.md) and [`STORE_LISTING.md`](../STORE_LISTING.md).

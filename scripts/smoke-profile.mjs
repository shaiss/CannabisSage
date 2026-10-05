#!/usr/bin/env node
/**
 * Headless checks for the opt-in local taste profile (no Chrome required).
 * Run: node scripts/smoke-profile.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extension');

function loadScripts(files, sandbox) {
  for (const f of files) {
    const code = fs.readFileSync(path.join(ext, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
}

function makeChrome(store) {
  return {
    runtime: { getURL: (p) => p },
    storage: {
      local: {
        get: (keys, cb) => {
          if (keys == null) {
            cb({ ...store });
            return;
          }
          const list = Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
              ? [keys]
              : Object.keys(keys);
          const out = {};
          list.forEach((k) => {
            if (Object.prototype.hasOwnProperty.call(store, k)) out[k] = store[k];
          });
          cb(out);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          cb && cb();
        },
        remove: (keys, cb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            delete store[k];
          });
          cb && cb();
        }
      }
    }
  };
}

const store = {};
const sandbox = {
  console,
  URL,
  chrome: makeChrome(store),
  globalThis: null,
  window: null
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

loadScripts(['lib/csi-core.js', 'lib/csi-profile.js', 'lib/csi-storage.js'], vm.createContext(sandbox));

const CSI = sandbox.CSI;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(CSI.profile, 'profile module');
assert(CSI.storage.KEYS.PROFILE === 'csi_taste_profile', 'storage key');
assert(CSI.features === undefined, 'profile tests do not require feature gates');

const copyBlob = JSON.stringify(CSI.profile.COPY);
assert(
  !/\b(mood|health|symptom|dosing|dose|medical|effects?|relief|anxiety|pain|treatment|euphoria)\b/i.test(
    copyBlob
  ),
  'no medical or effects language in profile copy'
);

const loadedEmpty = await CSI.storage.loadTasteProfile();
assert(loadedEmpty.enabled === false, 'opt-in default is off');
assert(!Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'nothing stored until opt-in');

const skipped = await CSI.storage.saveTasteProfile({ enabled: false, forms: ['flower'] });
assert(skipped.ok, 'disabled payload is accepted as a no-store');
assert(!Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'unchecked profile is not written');

const rejectedNotes = CSI.profile.normalize({
  enabled: true,
  notes: 'citrus mood for evenings'
});
assert(!rejectedNotes.ok, 'free-text notes field rejected');

const rejectedUnknown = CSI.profile.normalize({
  enabled: true,
  favoriteVibe: 'calm'
});
assert(!rejectedUnknown.ok && /unknown field/.test(rejectedUnknown.error), 'unknown fields rejected');

const rejectedTerp = CSI.profile.normalize({
  enabled: true,
  likedTerpenes: ['smells like candy']
});
assert(!rejectedTerp.ok, 'unknown terpene string rejected');

const rejectedForm = CSI.profile.normalize({
  enabled: true,
  forms: ['gummies']
});
assert(!rejectedForm.ok, 'unknown form rejected');

const rejectedBrand = CSI.profile.normalize({
  enabled: true,
  brandLoyal: ['<script>alert(1)</script>']
});
assert(!rejectedBrand.ok, 'free-text / unsafe brand rejected');

const rejectedUrl = CSI.profile.normalize({
  enabled: true,
  boughtBefore: { 'https://evil.example/product/1': 'rebuy' }
});
assert(!rejectedUrl.ok, 'unsupported product URL rejected');

const sampleUrl = 'https://www.sunnyside.shop/product/abc-1';
const saved = await CSI.storage.saveTasteProfile({
  enabled: true,
  forms: ['flower', 'vape'],
  sizes: ['3.5g'],
  cannabinoidRatio: 'thc-forward',
  potencyBandThc: '15-25',
  likedTerpenes: ['Limonene', 'Beta-Myrcene'],
  avoidTerpenes: ['Linalool'],
  tripBudgetUsd: 80,
  homeStore: 'sunnyside',
  secondaryStores: ['zenleaf', 'sunnyside'],
  brandLoyal: ['Savvy'],
  brandAvoid: ['House Brand'],
  dealTier: 'sale',
  boughtBefore: { [sampleUrl]: 'rebuy' }
});
assert(saved.ok && saved.value.enabled === true, 'opt-in save');
assert(store.csi_taste_profile, 'profile written to chrome.storage.local');
assert(saved.value.secondaryStores.includes('sunnyside') === false, 'home store dropped from secondary');
assert(saved.value.likedTerpenes.includes('Limonene'), 'liked terpenes kept');
assert(saved.value.boughtBefore[CSI.profile.productKeyFromUrl(sampleUrl)] === 'rebuy', 'flag stored');

const edited = await CSI.storage.saveTasteProfile({
  ...saved.value,
  potencyBandThc: '25-plus',
  tripBudgetUsd: 120
});
assert(edited.ok && edited.value.potencyBandThc === '25-plus', 'edit persists');
assert(edited.value.tripBudgetUsd === 120, 'budget edit');

const dumped = await CSI.storage.exportTasteProfile();
assert(dumped.ok && dumped.json.includes('"schemaVersion": 1'), 'export json');
const roundTrip = CSI.profile.normalize(JSON.parse(dumped.json));
assert(roundTrip.ok && roundTrip.value.tripBudgetUsd === 120, 'export round-trip');

const flagged = await CSI.storage.setBoughtBeforeFlag(sampleUrl, 'never');
assert(flagged.ok && flagged.value.boughtBefore[CSI.profile.productKeyFromUrl(sampleUrl)] === 'never', 'flag update');
const cleared = await CSI.storage.setBoughtBeforeFlag(sampleUrl, 'never');
assert(cleared.ok && !cleared.value.boughtBefore[CSI.profile.productKeyFromUrl(sampleUrl)], 'same flag clears');

const map = {
  preferredTerpenes: { Humulene: 0.4 },
  avoidTerpenes: [],
  minMatchScore: 0.32,
  preferHighTotalTerps: true
};
const merged = CSI.profile.applyToTasteMap(map, edited.value);
assert(merged.preferredTerpenes.Humulene === 0.4, 'existing taste-map weights kept');
assert(merged.preferredTerpenes.Limonene === 0.75, 'profile liked terpenes feed the map');
assert(merged.avoidTerpenes.includes('Linalool'), 'profile avoid terpenes feed the map');
assert(map.preferredTerpenes.Limonene == null, 'taste map object is not mutated in place');

await CSI.storage.deleteTasteProfile();
assert(!Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'delete removes the key');
const afterDelete = await CSI.storage.loadTasteProfile();
assert(afterDelete.enabled === false, 'load after delete is off');
const noExport = await CSI.storage.exportTasteProfile();
assert(!noExport.ok, 'export fails when nothing is stored');

const features = fs.readFileSync(path.join(ext, 'lib/csi-features.js'), 'utf8');
assert(/tasteProfile:\s*true/.test(features), 'tasteProfile is a Free gate');
assert(!/const PRO_FEATURES = \{[^}]*tasteProfile/.test(features), 'tasteProfile is not Pro');
assert(/tasteMap:\s*true/.test(features), 'taste-map stays Pro');

const popupHtml = fs.readFileSync(path.join(ext, 'popup/popup.html'), 'utf8');
assert(popupHtml.includes('id="profile-enable"'), 'popup opt-in');
assert(popupHtml.includes('profile-export'), 'popup export');
assert(popupHtml.includes('profile-delete'), 'popup delete');
assert(!/eval\(|new Function\(/.test(fs.readFileSync(path.join(ext, 'lib/csi-profile.js'), 'utf8')), 'no eval');

const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.19', 'manifest 1.3.19');
assert(manifest.permissions.join(',') === 'storage', 'no new permissions');
assert(manifest.content_scripts[1].js.includes('lib/csi-profile.js'), 'profile content script');

console.log('smoke-profile: OK');

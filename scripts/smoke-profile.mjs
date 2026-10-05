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

loadScripts(
  ['lib/csi-core.js', 'lib/csi-profile.js', 'lib/csi-storage.js', 'lib/csi-fetch.js'],
  vm.createContext(sandbox)
);

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
assert(skipped.ok, 'disabled payload before opt-in is accepted as a no-store');
assert(!Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'unchecked profile is not written before first opt-in');

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

const rejectedSubstring = CSI.profile.normalize({
  enabled: true,
  likedTerpenes: ['contains limonene']
});
assert(!rejectedSubstring.ok, 'substring terpene phrases are rejected');

const aliasTerp = CSI.profile.normalize({
  enabled: true,
  likedTerpenes: ['myrcene', 'Limonene']
});
assert(aliasTerp.ok && aliasTerp.value.likedTerpenes.includes('Beta-Myrcene'), 'explicit myrcene alias');
assert(aliasTerp.value.likedTerpenes.includes('Limonene'), 'canonical Limonene id');

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

const otherUrl = 'https://www.sunnyside.shop/product/xyz-2';
const [flagA, flagB] = await Promise.all([
  CSI.storage.setBoughtBeforeFlag(sampleUrl, 'rebuy'),
  CSI.storage.setBoughtBeforeFlag(otherUrl, 'fine')
]);
assert(flagA.ok && flagB.ok, 'concurrent bought-before writes succeed');
const afterConcurrent = await CSI.storage.loadTasteProfile();
assert(
  afterConcurrent.boughtBefore[CSI.profile.productKeyFromUrl(sampleUrl)] === 'rebuy',
  'first concurrent flag kept'
);
assert(
  afterConcurrent.boughtBefore[CSI.profile.productKeyFromUrl(otherUrl)] === 'fine',
  'second concurrent flag kept'
);

assert(typeof CSI.storeElementProduct === 'function', 'host product cache helper');
const hostCard = { dataset: {} };
CSI.storeElementProduct(hostCard, {
  url: sampleUrl,
  name: 'Test Flower',
  matchScore: 0.88,
  tasteProfile: afterConcurrent,
  tasteMap: { preferredTerpenes: { Limonene: 1 }, avoidTerpenes: [] }
});
const hostJson = JSON.parse(hostCard.dataset.csiProductData);
assert(!Object.prototype.hasOwnProperty.call(hostJson, 'tasteProfile'), 'data-csi-product-data omits taste profile');
assert(!Object.prototype.hasOwnProperty.call(hostJson, 'tasteMap'), 'data-csi-product-data omits taste map');
assert(hostJson.matchScore === 0.88, 'derived match score may be cached on the card');
assert(hostJson.name === 'Test Flower', 'product fields still cached');
assert(!CSI.getElementProduct(hostCard).tasteProfile, 'getElementProduct does not return profile');

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

// Uncheck + Save keeps the key with enabled:false (fields + boughtBefore retained).
const boughtKey = CSI.profile.productKeyFromUrl(sampleUrl);
store.csi_taste_profile = {
  ...store.csi_taste_profile,
  boughtBefore: { [boughtKey]: 'rebuy' }
};
const disabled = await CSI.storage.saveTasteProfile({ enabled: false });
assert(disabled.ok && disabled.value.enabled === false, 'disable save ok');
assert(Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'disable keeps the storage key');
assert(store.csi_taste_profile.enabled === false, 'stored enabled is false');
assert(store.csi_taste_profile.forms.includes('flower'), 'forms retained while disabled');
assert(store.csi_taste_profile.tripBudgetUsd === 120, 'budget retained while disabled');
assert(store.csi_taste_profile.dealTier === 'sale', 'deal tier retained while disabled');
assert(store.csi_taste_profile.boughtBefore[boughtKey] === 'rebuy', 'boughtBefore retained while disabled');

const loadedDisabled = await CSI.storage.loadTasteProfile();
assert(loadedDisabled.enabled === false, 'load reports disabled');
assert(CSI.profile.isStoredProfile(loadedDisabled), 'load returns full stored profile when disabled');
assert(loadedDisabled.likedTerpenes.includes('Limonene'), 'popup can reload liked terpenes while off');
assert(loadedDisabled.boughtBefore[boughtKey] === 'rebuy', 'popup can reload boughtBefore while off');

const exportWhileOff = await CSI.storage.exportTasteProfile();
assert(exportWhileOff.ok && exportWhileOff.json.includes('"enabled": false'), 'export stays available while data exists');

const noFlagWhileOff = await CSI.storage.setBoughtBeforeFlag(sampleUrl, 'fine');
assert(!noFlagWhileOff.ok, 'bought-before writes require enabled profile');

const reenabled = await CSI.storage.saveTasteProfile({ ...loadedDisabled, enabled: true });
assert(reenabled.ok && reenabled.value.enabled === true, 're-enable without blank rewrite');
assert(reenabled.value.forms.includes('flower'), 're-enable keeps forms');
assert(reenabled.value.boughtBefore[boughtKey] === 'rebuy', 're-enable keeps boughtBefore');

await CSI.storage.saveTasteProfile({ enabled: false });
await CSI.storage.deleteTasteProfile();
assert(!Object.prototype.hasOwnProperty.call(store, 'csi_taste_profile'), 'delete removes the key');
const afterDelete = await CSI.storage.loadTasteProfile();
assert(afterDelete.enabled === false, 'load after delete is off');
assert(!CSI.profile.isStoredProfile(afterDelete), 'delete leaves no stored fields');
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
assert(/Turning off stops using the profile/i.test(popupHtml), 'popup copy: off stops using');
assert(/Delete wipes it/i.test(popupHtml), 'popup copy: Delete wipes');
const fieldsetMatch = popupHtml.match(/<fieldset[^>]*id="profile-fields"[^>]*>([\s\S]*?)<\/fieldset>/);
assert(fieldsetMatch, 'profile-fields fieldset present');
assert(!/id="profile-save"/.test(fieldsetMatch[1]), 'Save is outside profile-fields');
assert(!/id="profile-export"/.test(fieldsetMatch[1]), 'Export is outside profile-fields');
assert(!/id="profile-delete"/.test(fieldsetMatch[1]), 'Delete is outside profile-fields');
assert(!/eval\(|new Function\(/.test(fs.readFileSync(path.join(ext, 'lib/csi-profile.js'), 'utf8')), 'no eval');

// Locks: deal-tier / trip budget stay inert for Free similar-by-chem ranking.
const rankingSrc = fs.readFileSync(path.join(ext, 'lib/csi-core.js'), 'utf8');
const pdpSrc = fs.readFileSync(path.join(ext, 'content-pdp.js'), 'utf8');
const listingSrc = fs.readFileSync(path.join(ext, 'content-listing.js'), 'utf8');
assert(!/dealTier/.test(rankingSrc), 'dealTier not used in core ranking');
assert(!/tripBudget/.test(rankingSrc), 'tripBudget not used in core ranking');
assert(!/dealTier|tripBudget/.test(pdpSrc), 'dealTier/tripBudget inert on PDP');
assert(!/dealTier|tripBudget/.test(listingSrc), 'dealTier/tripBudget inert on listing');
assert(!/p\.tasteProfile\s*=/.test(listingSrc), 'listing storage listener does not attach profile to cards');
assert(listingSrc.includes('tasteProfile: state.profile'), 'listing badges receive profile from content-script state');

const popupJs = fs.readFileSync(path.join(ext, 'popup/popup.js'), 'utf8');
assert(popupJs.includes("sunnyside: 'Sunnyside'"), 'adapter store labels OK in popup pickers');
assert(popupJs.includes("zenleaf: 'Zen Leaf'"), 'Zen Leaf label in popup');

const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.19', 'manifest 1.3.19');
assert(manifest.permissions.join(',') === 'storage', 'no new permissions');
assert(manifest.content_scripts[1].js.includes('lib/csi-profile.js'), 'profile content script');

console.log('smoke-profile: OK');

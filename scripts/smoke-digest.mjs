#!/usr/bin/env node
/**
 * Headless checks for the Pro saved-item digest (v1.3.31).
 * Local observations only. Same gate on every supported store.
 * Run: node scripts/smoke-digest.mjs
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
  const sends = [];
  return {
    sends,
    runtime: {
      getURL: (p) => p,
      lastError: null,
      sendMessage: (msg, cb) => {
        sends.push(msg);
        if (cb) cb({ ok: true });
      }
    },
    storage: {
      local: {
        get: (keys, cb) => {
          if (keys == null) {
            cb({ ...store });
            return;
          }
          const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
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
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
          cb && cb();
        }
      }
    }
  };
}

const store = {};
const chromeApi = makeChrome(store);
const sandbox = {
  console,
  URL,
  fetch: () => {
    throw new Error('digest must not fetch');
  },
  XMLHttpRequest: function XMLHttpRequest() {
    throw new Error('digest must not XHR');
  },
  chrome: chromeApi,
  globalThis: null,
  window: null,
  location: { href: 'https://chrome-extension.invalid/popup' }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

loadScripts(
  [
    'lib/csi-packaged-paths.js',
    'lib/csi-core.js',
    'adapters/interface.js',
    'adapters/sunnyside.js',
    'adapters/zenleaf.js',
    'adapters/terravida.js',
    'adapters/curaleaf.js',
    'adapters/iheartjane.js',
    'adapters/dutchie.js',
    'adapters/shopd.js',
    'adapters/registry.js',
    'lib/csi-entitlement.js',
    'lib/csi-features.js',
    'lib/csi-storage.js',
    'lib/csi-profile.js',
    'lib/csi-digest.js'
  ],
  vm.createContext(sandbox)
);

const CSI = sandbox.CSI;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(CSI.VERSION === '1.3.31', 'core version 1.3.31');
assert(CSI.digest.FEATURE_ID === 'savedItemDigest', 'feature id');
assert(CSI.features.PRO_FEATURES.savedItemDigest === true, 'digest is Pro');
assert(CSI.features.FREE_FEATURES.savedItemDigest !== true, 'digest is not Free');
assert(CSI.features.can('savedItemDigest') === false, 'free can() is false');

const copyBlob = JSON.stringify(CSI.digest.COPY);
assert(
  !/\b(mood|health|symptom|dosing|dose|medical|effects?|relief|anxiety|pain|treatment|euphoria)\b/i.test(copyBlob),
  'no medical or effects language in digest copy'
);
assert(
  !/sunnyside|zenleaf|terravida|curaleaf|rise|beyond hello|dutchie|trulieve|liberty/i.test(copyBlob),
  'digest copy has no retailer names'
);
const digestSrc = fs.readFileSync(path.join(ext, 'lib/csi-digest.js'), 'utf8');
assert(!/\bfetch\s*\(|XMLHttpRequest|eval\(/.test(digestSrc), 'digest module does not fetch or eval');
assert(!/chrome\.alarms|notifications/.test(digestSrc), 'digest module does not schedule alarms or notifications');

const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.31', 'manifest 1.3.31');
assert(manifest.permissions.length === 1 && manifest.permissions[0] === 'storage', 'no new required permissions');
assert(!(manifest.optional_permissions || []).includes('notifications'), 'notifications stay off');
assert(!JSON.stringify(manifest.permissions).includes('alarms'), 'alarms not required');
const isolated = (manifest.content_scripts || []).filter((cs) => (cs.js || []).includes('content-listing.js'));
assert(isolated.length >= 1, 'listing content script present');
isolated.forEach((cs) => {
  assert(cs.js.includes('lib/csi-digest.js'), 'digest ships in the content script');
  assert(!cs.js.includes('lib/csi-picks.js'), 'picks stay off the host page');
});

const listingSrc = fs.readFileSync(path.join(ext, 'content-listing.js'), 'utf8');
const pdpSrc = fs.readFileSync(path.join(ext, 'content-pdp.js'), 'utf8');
const popupSrc = fs.readFileSync(path.join(ext, 'popup/popup.js'), 'utf8');
assert(listingSrc.includes('cannabis-sage-save-btn'), 'listing save control');
assert(pdpSrc.includes('csi-pdp-save'), 'pdp save control');
assert(!/savedItemDigest[\s\S]{0,120}adapter\.id/.test(listingSrc), 'listing digest gate is not per-adapter');
assert(!listingSrc.includes("can?.('savedItemDigest')"), 'save stays available without the Pro gate');
assert(
  /if\s*\(\s*!stillEnriching\s*\)\s*await noteSavedObservations/.test(listingSrc),
  'saved observations wait until listing cards finish loading'
);
assert(popupSrc.includes('digest-upgrade'), 'popup upsell control');
assert(popupSrc.includes('openUpgrade'), 'popup upsell uses the site upgrade link');
const bgSrc = fs.readFileSync(path.join(ext, 'background.js'), 'utf8');
assert(bgSrc.includes('CSI_SET_DIGEST_BADGE'), 'badge is local action text');
assert(bgSrc.includes('CSI_SAVED_WATCH'), 'saved-watch writes are serialized in the service worker');
assert(bgSrc.includes('ensureSavedWatchModules'), 'worker loads the digest modules for watch writes');
const workerStartup = bgSrc.split('chrome.runtime.onMessage')[0];
assert(
  workerStartup.includes("'lib/csi-digest.js'") && workerStartup.includes("'lib/csi-storage.js'"),
  'digest modules import at worker startup, not inside a message handler'
);
assert(
  workerStartup.includes("'lib/csi-entitlement.js'") && workerStartup.includes("'lib/csi-features.js'"),
  'license and feature modules import at worker startup'
);
assert(!bgSrc.includes('payload.isPro'), 'commit op does not read payload isPro');
assert(bgSrc.includes('savedDigestIsProFromLicense'), 'commit op derives Pro from the stored license');
assert(
  !/function ensureSavedWatchModules\(\)\s*\{[^}]*importScripts/.test(bgSrc),
  'ensureSavedWatchModules does not call importScripts'
);
assert(!/FETCH_PRODUCT_HTML[\s\S]{0,200}CSI_SET_DIGEST_BADGE/.test(bgSrc), 'badge handler is not a product fetch');

function obs(overrides) {
  return {
    price: 40,
    onSale: false,
    belowMedian: false,
    inStock: true,
    name: 'Listed flower',
    seenAt: 1,
    ...overrides
  };
}

let rec = CSI.digest.applyObservation(null, obs({}));
assert(CSI.digest.diffRecord(rec) === null, 'first sight is a baseline, not an alert');

rec = CSI.digest.applyObservation(rec, obs({ inStock: false, seenAt: 2 }));
assert(CSI.digest.diffRecord(rec) === null, 'going out of stock is not a digest line');
rec = CSI.digest.applyObservation(rec, obs({ inStock: true, seenAt: 3 }));
const restock = CSI.digest.diffRecord(rec);
assert(restock && restock.kinds.length === 1 && restock.kinds[0] === 'restock', 'restock after an out-of-stock sight');
assert(CSI.digest.reasons(restock).join(' ') === 'Back in stock', 'restock reason');

rec = CSI.digest.applyObservation(null, obs({ price: 40 }));
rec = CSI.digest.applyObservation(rec, obs({ price: 32, seenAt: 4 }));
const drop = CSI.digest.diffRecord(rec);
assert(drop.kinds.includes('priceDrop'), 'price drop');
assert(drop.priceFrom === 40 && drop.priceTo === 32, 'price drop keeps both listed prices');
assert(CSI.digest.reasons(drop)[0].includes('$40.00') && CSI.digest.reasons(drop)[0].includes('$32.00'), 'reason uses the observed prices');

rec = CSI.digest.applyObservation(rec, obs({ price: 48, seenAt: 5 }));
assert(!CSI.digest.diffRecord(rec)?.kinds.includes('priceDrop'), 'a higher price is not a drop');

rec = CSI.digest.applyObservation(null, obs({ price: 10 }));
rec = CSI.digest.applyObservation(rec, obs({ price: 10.004, seenAt: 6 }));
assert(CSI.digest.diffRecord(rec) === null, 'sub-cent noise is not a drop');

rec = CSI.digest.applyObservation(null, obs({ onSale: false, belowMedian: false }));
rec = CSI.digest.applyObservation(rec, obs({ onSale: true, seenAt: 7 }));
const sale = CSI.digest.diffRecord(rec);
assert(sale.kinds.includes('deal') && sale.saleListed === true, 'sale pickup is a deal');
assert(!sale.kinds.includes('priceDrop'), 'sale without a lower price is not a price drop');

rec = CSI.digest.applyObservation(null, obs({ onSale: true, belowMedian: false }));
assert(CSI.digest.diffRecord(rec) === null, 'already on sale at first sight is not a new deal');
rec = CSI.digest.applyObservation(rec, obs({ onSale: false, seenAt: 8 }));
rec = CSI.digest.applyObservation(rec, obs({ onSale: true, seenAt: 9 }));
assert(CSI.digest.diffRecord(rec).saleListed === true, 'sale that went away and came back is a deal');

rec = CSI.digest.applyObservation(null, obs({ belowMedian: false, onSale: false }));
rec = CSI.digest.applyObservation(rec, obs({ belowMedian: true, seenAt: 10 }));
const medianDeal = CSI.digest.diffRecord(rec);
assert(medianDeal.kinds.includes('deal') && medianDeal.belowMedian === true, 'below-median pickup is a deal');
assert(CSI.digest.reasons(medianDeal).some((line) => /median listed price/i.test(line)), 'median reason has no invented percent');

rec = CSI.digest.applyObservation(null, obs({ belowMedian: null, onSale: false }));
rec = CSI.digest.applyObservation(rec, obs({ belowMedian: true, seenAt: 11 }));
assert(!(CSI.digest.diffRecord(rec)?.kinds || []).includes('deal'), 'first known median is not a deal pickup');

assert(CSI.digest.readListedStock('Chem unavailable') === null, 'chem unavailable is not stock');
assert(CSI.digest.readListedStock('Sold out') === false, 'sold out');
assert(CSI.digest.readListedStock('Out of stock') === false, 'out of stock');
assert(CSI.digest.inStockFromListed({ text: 'Sold out', price: 40 }) === false, 'sold-out wins over a listed price');
assert(CSI.digest.inStockFromListed({ text: 'THC 22% $40', price: 40 }) === true, 'listed price without sold-out is in stock');
assert(CSI.digest.inStockFromListed({ text: 'THC 22%', price: null }) === null, 'no price and no sold-out stays unknown');
assert(CSI.digest.belowMedianState(10, 20, 2) === null, 'median needs three prices');
assert(CSI.digest.belowMedianState(10, 20, 3) === true, 'below median when the sample is real');
assert(CSI.digest.belowMedianState(25, 20, 3) === false, 'not below median');

const DAY = CSI.digest.DAY_MS;
const saved = [{ url: 'https://www.sunnyside.shop/product/listed-flower', name: 'Listed flower', adapterId: 'sunnyside', savedAt: 1 }];
const canonical = CSI.profile.productKeyFromUrl(saved[0].url);
assert(canonical, 'sample product url is allowlisted');
saved[0].url = canonical;

function watchWith(record, extra) {
  return CSI.digest.normalizeWatch({
    items: saved,
    byUrl: { [canonical]: record },
    lastIssuedAt: null,
    issued: null,
    ...(extra || {})
  });
}

let record = CSI.digest.applyObservation(null, obs({ price: 40, seenAt: 1000 }));
let quiet = CSI.digest.evaluate({ savedItems: saved, digest: watchWith(record), now: 5_000, isPro: true, commit: true });
assert(quiet.view.status === 'quiet', 'no change does not issue a digest');
assert(quiet.persist === false, 'empty check does not burn the daily slot');
assert(quiet.digest.lastIssuedAt == null, 'lastIssuedAt stays empty');

record = CSI.digest.applyObservation(record, obs({ price: 30, seenAt: 6_000 }));
const issued = CSI.digest.evaluate({
  savedItems: saved,
  digest: watchWith(record),
  now: 10_000,
  isPro: true,
  commit: true
});
assert(issued.persist === true, 'a real change issues a digest');
assert(issued.view.status === 'digest', 'digest status');
assert(issued.view.items.length === 1, 'one saved item');
assert(issued.view.items[0].kinds.includes('priceDrop'), 'issued price drop');
assert(issued.view.items[0].url === canonical, 'digest links the product url');

record = CSI.digest.applyObservation(issued.digest.byUrl[canonical], obs({ price: 22, seenAt: 20_000 }));
const sameDay = CSI.digest.evaluate({
  savedItems: saved,
  digest: { ...issued.digest, items: saved, byUrl: { [canonical]: record } },
  now: 10_000 + 60 * 60 * 1000,
  isPro: true,
  commit: true
});
assert(sameDay.persist === false, 'second open the same day does not issue again');
assert(sameDay.view.items.length === 1, 'same digest stays visible');
assert(sameDay.view.items[0].priceTo === 30, 'later same-day drop stays out of this digest');
assert(sameDay.view.issuedAt === 10_000, 'issued time stays on the first digest');

const nextDay = CSI.digest.evaluate({
  savedItems: saved,
  digest: { ...issued.digest, items: saved, byUrl: { [canonical]: record } },
  now: 10_000 + DAY + 1,
  isPro: true,
  commit: true
});
assert(nextDay.persist === true, 'a new digest can issue after 24 hours');
assert(nextDay.view.items[0].priceTo === 22, 'next digest includes the later drop');
assert(nextDay.view.items[0].priceFrom === 30, 'next digest starts from the prior digest price');

const lockedMessages = new Set();
const proReasons = [];
const storeUrls = [
  ['sunnyside', 'https://www.sunnyside.shop/product/listed-flower'],
  ['zenleaf', 'https://zenleafdispensaries.com/locations/malvern/medical-menu/menu/flower/listed-flower'],
  ['terravida', 'https://zenleafdispensaries.com/locations/malvern/medical-menu/menu/flower/listed-flower'],
  ['curaleaf', 'https://curaleaf.com/shop/pennsylvania/curaleaf-pa-king-of-prussia/menu/vape/listed-flower'],
  ['iheartjane', 'https://risecannabis.com/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/product/1/listed-flower'],
  ['dutchie', 'https://dutchie.com/embedded-menu/liberty-norristown/product/listed-flower'],
  ['shopd', 'https://www.trulieve.com/shopd/product/listed-flower']
];
const beyond = CSI.profile.productKeyFromUrl(
  'https://beyond-hello.com/pennsylvania-dispensaries/west-chester/medical-menu/menu/products/9/listed-flower'
);
assert(beyond, 'beyond hello product url allowlisted');

storeUrls.forEach(([adapterId, raw]) => {
  const url = CSI.profile.productKeyFromUrl(raw);
  assert(url, `allowlisted url for ${adapterId}`);
  const one = [{ url, name: 'Listed flower', adapterId, savedAt: 1 }];
  let row = CSI.digest.applyObservation(null, obs({ inStock: false, price: 40 }));
  row = CSI.digest.applyObservation(row, obs({ inStock: true, price: 28, onSale: true, belowMedian: false, seenAt: 50 }));
  const locked = CSI.digest.evaluate({
    savedItems: one,
    digest: { items: one, byUrl: { [url]: row }, lastIssuedAt: null, issued: null },
    now: 80,
    isPro: false,
    commit: true
  });
  assert(locked.view.status === 'locked', `free stays locked for ${adapterId}`);
  assert(locked.persist === false, `free commit does not persist for ${adapterId}`);
  assert(!locked.view.items.length, `free sees no change list for ${adapterId}`);
  lockedMessages.add(locked.view.message);
  const opened = CSI.digest.evaluate({
    savedItems: one,
    digest: { items: one, byUrl: { [url]: row }, lastIssuedAt: null, issued: null },
    now: 80,
    isPro: true,
    commit: false
  });
  assert(opened.view.status === 'digest', `pro digest for ${adapterId}`);
  proReasons.push(CSI.digest.reasons(opened.view.items[0]).join('|'));
});
assert(lockedMessages.size === 1, 'locked copy is identical across stores');
assert(new Set(proReasons).size === 1, 'the same stock and price change reads the same on every store');
assert(!proReasons[0].includes('http'), 'reasons do not embed a store url');

CSI.entitlement.isPro = () => false;
CSI.registry.BUILTIN_ORDER.forEach((id) => {
  CSI.registry.setActiveAdapter(CSI.adapters[id]);
  assert(CSI.features.can('savedItemDigest') === false, `free gate ignores active adapter ${id}`);
});
CSI.entitlement.isPro = () => true;
CSI.registry.BUILTIN_ORDER.forEach((id) => {
  CSI.registry.setActiveAdapter(CSI.adapters[id]);
  assert(CSI.features.can('savedItemDigest') === true, `pro gate ignores active adapter ${id}`);
});

const gates = fs.readFileSync(path.join(root, 'web/lib/feature-gates.ts'), 'utf8');
assert(gates.includes("'savedItemDigest'"), 'landing gates list savedItemDigest');
const pricing = fs.readFileSync(path.join(root, 'web/lib/pricing-public.ts'), 'utf8');
assert(/daily restock and deal digest/i.test(pricing), 'public pro label mentions the digest');

// Storage: save, observe, cap, and reject a non-product URL. No network.
CSI.entitlement.isPro = () => true;
const toggled = await CSI.storage.toggleSavedItem({
  url: canonical,
  name: 'Listed flower',
  adapterId: 'sunnyside',
  observation: obs({ price: 40, inStock: true, seenAt: 1 })
});
assert(toggled.ok && toggled.saved, 'save writes locally');
assert(store.csi_saved_watch.items.length === 1, 'one storage key for the watch list');
const again = await CSI.storage.recordSavedObservation(canonical, obs({ price: 40, inStock: true, seenAt: 2 }));
assert(again.recorded === false, 'unchanged observation is not rewritten');
const changed = await CSI.storage.recordSavedObservation(canonical, obs({ price: 21, inStock: true, seenAt: 3 }));
assert(changed.recorded === true, 'price change is stored');
const committed = await CSI.storage.commitSavedDigest(100_000);
assert(committed.view.status === 'digest', 'storage commit returns the digest');
assert(committed.view.items[0].priceTo === 21, 'stored digest price is the observed one');
const removed = await CSI.storage.removeSavedItem(canonical);
assert(removed.saved === false, 'remove drops the saved item');
const removedAgain = await CSI.storage.removeSavedItem(canonical);
assert(removedAgain.saved === false, 'a second remove does not re-save');
assert((await CSI.storage.loadSavedItems()).length === 0, 'saved list empty');

let outRec = CSI.digest.applyObservation(null, obs({ inStock: false, price: 40, seenAt: 1 }));
outRec = CSI.digest.applyObservation(outRec, obs({ inStock: null, price: null, seenAt: 2 }));
const keptOut = CSI.digest.commitRecord(outRec);
assert(keptOut.outSinceDigest === true, 'unknown stock does not clear an out-of-stock sighting');
const back = CSI.digest.applyObservation(keptOut, obs({ inStock: true, price: 40, seenAt: 3 }));
assert(CSI.digest.diffRecord(back).kinds.includes('restock'), 'restock still counts after an unknown reading');

const blocked = await CSI.storage.toggleSavedItem({ url: 'https://example.com/product/nope', name: 'Nope' });
assert(blocked.ok === false, 'unsupported host is not saved');
const insecure = await CSI.storage.toggleSavedItem({ url: 'http://www.sunnyside.shop/product/listed-flower', name: 'Nope' });
assert(insecure.ok === false, 'http product urls are not saved');

let filler = 0;
while (filler < CSI.digest.MAX_SAVED) {
  const url = CSI.profile.productKeyFromUrl(`https://www.sunnyside.shop/product/saved-${filler}`);
  const added = await CSI.storage.toggleSavedItem({
    url,
    name: 'Listed flower',
    observation: obs({ price: 10, seenAt: filler + 1 })
  });
  assert(added.ok, `save ${filler}`);
  filler += 1;
}
const overflow = await CSI.storage.toggleSavedItem({
  url: 'https://www.sunnyside.shop/product/saved-overflow',
  name: 'Listed flower'
});
assert(overflow.ok === false && overflow.error === 'list full', 'saved list caps');

assert(chromeApi.sends.length === 0 || chromeApi.sends.every((msg) => msg.type === 'CSI_SET_DIGEST_BADGE'), 'only local badge messages');
assert(!JSON.stringify(store).includes('example.com'), 'rejected host is not stored');

// Service worker: CSI_SAVED_WATCH commit ignores payload.isPro and uses stored license.
{
  const workerStore = {};
  const listeners = [];
  const workerChrome = {
    runtime: {
      id: 'csi-test-extension',
      getURL:
        /** @param {string} p Packaged path. @returns {string} The same path. */
        (p) => p,
      lastError: null,
      onInstalled: {
        /** Ignore install in the worker mock. */
        addListener() {}
      },
      onStartup: {
        /** Ignore startup in the worker mock. */
        addListener() {}
      },
      onMessage: {
        /**
         * Record the service worker's message listener.
         * @param {Function} fn
         */
        addListener(fn) {
          listeners.push(fn);
        }
      },
      /**
       * Accept a runtime message from the worker mock.
       * @param {object} _msg
       * @param {Function} [cb]
       */
      sendMessage(_msg, cb) {
        if (cb) cb({ ok: true });
      }
    },
    storage: {
      local: {
        /**
         * Read keys from the in-memory extension storage mock.
         * @param {string|string[]|object|null} keys
         * @param {Function} [cb]
         * @returns {Promise<object>|undefined}
         */
        get(keys, cb) {
          const out = {};
          if (keys == null) Object.assign(out, workerStore);
          else {
            const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
            list.forEach(
              /** @param {string} k Storage key to copy. */
              (k) => {
                if (Object.prototype.hasOwnProperty.call(workerStore, k)) out[k] = workerStore[k];
              }
            );
          }
          if (typeof cb === 'function') {
            cb(out);
            return undefined;
          }
          return Promise.resolve(out);
        },
        /**
         * Write values into the in-memory extension storage mock.
         * @param {object} obj
         * @param {Function} [cb]
         * @returns {Promise<void>|undefined}
         */
        set(obj, cb) {
          Object.assign(workerStore, obj);
          if (typeof cb === 'function') cb();
          else return Promise.resolve();
        },
        /**
         * Delete keys from the in-memory extension storage mock.
         * @param {string|string[]} keys
         * @param {Function} [cb]
         * @returns {Promise<void>|undefined}
         */
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach(
            /** @param {string} k Storage key to delete. */
            (k) => delete workerStore[k]
          );
          if (typeof cb === 'function') cb();
          else return Promise.resolve();
        }
      }
    },
    action: {
      /**
       * Ignore badge color updates in the worker mock.
       * @param {object} _detail
       * @param {Function} [cb]
       */
      setBadgeBackgroundColor(_detail, cb) {
        if (cb) cb();
      },
      /**
       * Ignore badge text updates in the worker mock.
       * @param {object} _detail
       * @param {Function} [cb]
       */
      setBadgeText(_detail, cb) {
        if (cb) cb();
      }
    }
  };
  const workerSandbox = {
    console,
    URL,
    fetch:
      /** @returns {Promise<never>} Network is out of bounds for this commit test. */
      () => Promise.reject(new Error('worker digest commit must not fetch')),
    XMLHttpRequest:
      /** @returns {never} XHR is out of bounds for this commit test. */
      function XMLHttpRequest() {
        throw new Error('worker digest commit must not XHR');
      },
    chrome: workerChrome,
    ServiceWorkerGlobalScope:
      /** Mark the realm as a service worker. */
      function ServiceWorkerGlobalScope() {},
    /** Ignore late imports; modules are loaded before background.js. */
    importScripts() {},
    globalThis: null,
    window: null,
    self: null,
    location: { href: 'https://chrome-extension.invalid/background' }
  };
  workerSandbox.globalThis = workerSandbox;
  workerSandbox.window = workerSandbox;
  workerSandbox.self = workerSandbox;
  const workerContext = vm.createContext(workerSandbox);
  loadScripts(
    [
      'lib/csi-packaged-paths.js',
      'lib/csi-core.js',
      'adapters/interface.js',
      'adapters/sunnyside.js',
      'adapters/zenleaf.js',
      'adapters/terravida.js',
      'adapters/curaleaf.js',
      'adapters/iheartjane.js',
      'adapters/dutchie.js',
      'adapters/shopd.js',
      'adapters/registry.js',
      'lib/csi-entitlement.js',
      'lib/csi-features.js',
      'lib/csi-storage.js',
      'lib/csi-profile.js',
      'lib/csi-digest.js'
    ],
    workerContext
  );
  const W = workerSandbox.CSI;
  const wurl = W.profile.productKeyFromUrl('https://www.sunnyside.shop/product/listed-flower');
  let wrec = W.digest.applyObservation(null, obs({ price: 40, seenAt: 1000 }));
  wrec = W.digest.applyObservation(wrec, obs({ price: 30, seenAt: 6000 }));
  workerStore.csi_saved_watch = W.digest.normalizeWatch({
    items: [{ url: wurl, name: 'Listed flower', adapterId: 'sunnyside', savedAt: 1 }],
    byUrl: { [wurl]: wrec },
    lastIssuedAt: null,
    issued: null
  });
  workerStore.csi_entitlement = { active: false, status: 'inactive', plan: 'free' };
  vm.runInContext(fs.readFileSync(path.join(ext, 'background.js'), 'utf8'), workerContext, {
    filename: 'background.js'
  });
  assert(listeners.length === 1, 'worker registers one message listener');

  /**
   * Send one message through the worker listener from background.js.
   * Commit derives Pro from the stored license and ignores payload isPro.
   * @param {object} message
   * @returns {Promise<object|undefined>}
   */
  function dispatch(message) {
    return new Promise(
      /** @param {function(object|undefined): void} resolve */
      (resolve) => {
        const keep = listeners[0](
          message,
          { id: workerChrome.runtime.id },
          /** @param {object} value Reply from sendResponse. */
          (value) => resolve(value)
        );
        if (keep !== true) resolve(undefined);
      }
    );
  }

  const denied = await dispatch({
    type: 'CSI_SAVED_WATCH',
    op: 'commit',
    payload: { now: 10_000, isPro: true }
  });
  assert(denied && denied.view && denied.view.status === 'locked', 'non-Pro stored license ignores payload isPro true');
  assert(!denied.view.items.length, 'spoofed isPro does not list digest rows');
  assert(workerStore.csi_saved_watch.lastIssuedAt == null, 'spoofed isPro does not issue a digest');

  workerStore.csi_entitlement = {
    active: true,
    status: 'active',
    plan: 'pro',
    expiresAt: '2099-01-01T00:00:00.000Z'
  };
  const opened = await dispatch({
    type: 'CSI_SAVED_WATCH',
    op: 'commit',
    payload: { now: 10_000, isPro: false }
  });
  assert(opened && opened.view && opened.view.status === 'digest', 'stored Pro license still issues a digest');
  assert(opened.view.items[0].priceTo === 30, 'Pro digest uses the stored price drop');
  assert(workerStore.csi_saved_watch.lastIssuedAt === 10_000, 'Pro commit writes the digest');
}

console.log('smoke-digest: OK');

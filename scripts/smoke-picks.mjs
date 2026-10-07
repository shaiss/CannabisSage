#!/usr/bin/env node
/**
 * Headless checks for Pro “Picks for you” (v1.3.20).
 * Cached data only; profile never written into host-page DOM.
 * Run: node scripts/smoke-picks.mjs
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
    runtime: {
      getURL: (p) => p,
      lastError: null,
      sendMessage: () => {
        throw new Error('picks must not send runtime messages');
      }
    },
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
      },
      sync: {
        get: () => {
          throw new Error('picks must not use chrome.storage.sync');
        },
        set: () => {
          throw new Error('picks must not use chrome.storage.sync');
        }
      }
    }
  };
}

const store = {};
const sandbox = {
  console,
  URL,
  fetch: () => {
    throw new Error('picks must not fetch');
  },
  XMLHttpRequest: function () {
    throw new Error('picks must not XHR');
  },
  chrome: makeChrome(store),
  globalThis: null,
  window: null,
  location: { href: 'https://chrome-extension.invalid/popup' }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

loadScripts(
  [
    'lib/csi-core.js',
    'adapters/interface.js',
    'adapters/sunnyside.js',
    'adapters/zenleaf.js',
    'adapters/terravida.js',
    'adapters/iheartjane.js',
    'adapters/dutchie.js',
    'adapters/registry.js',
    'lib/csi-entitlement.js',
    'lib/csi-features.js',
    'lib/csi-storage.js',
    'lib/csi-profile.js',
    'lib/csi-picks.js'
  ],
  vm.createContext(sandbox)
);

const CSI = sandbox.CSI;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

assert(CSI.VERSION === '1.3.22', 'core version 1.3.22');
assert(CSI.picks, 'picks module');
assert(CSI.picks.FEATURE_ID === 'picksForYou', 'feature id');
assert(CSI.features.PRO_FEATURES.picksForYou === true, 'picksForYou is Pro');
assert(CSI.features.FREE_FEATURES.picksForYou !== true, 'picksForYou is not Free');
assert(CSI.features.FREE_FEATURES.tasteProfile === true, 'taste profile stays Free');

const copyBlob = JSON.stringify(CSI.picks.COPY);
assert(
  !/\b(mood|health|symptom|dosing|dose|medical|effects?|relief|anxiety|pain|treatment|euphoria)\b/i.test(
    copyBlob
  ),
  'no medical or effects language in picks copy'
);

const now = Date.now();
const flowerA = 'https://www.sunnyside.shop/product/limonene-flower';
const flowerB = 'https://www.sunnyside.shop/product/pinene-flower';
const skipBrandUrl = 'https://www.sunnyside.shop/product/skip-brand-flower';
const neverUrl = 'https://www.sunnyside.shop/product/never-again-flower';
const saleUrl = 'https://www.sunnyside.shop/product/sale-flower';
const otherStoreUrl = 'https://zenleafdispensaries.com/locations/pa/malvern/menu/product/other';
const wrongFormUrl = 'https://www.sunnyside.shop/product/vape-cart';

function cacheRow(url, data, fetchedAt, adapterId) {
  return {
    url,
    fetchedAt: fetchedAt || now - 5 * 60 * 1000,
    adapterId: adapterId || data.adapterId || 'sunnyside',
    data: { ...data, url, adapterId: adapterId || data.adapterId || 'sunnyside' }
  };
}

const baseProfile = CSI.profile.normalize({
  enabled: true,
  forms: ['flower'],
  sizes: ['3.5g'],
  cannabinoidRatio: 'thc-forward',
  potencyBandThc: '15-25',
  likedTerpenes: ['Limonene'],
  avoidTerpenes: ['Linalool'],
  tripBudgetUsd: 60,
  homeStore: 'sunnyside',
  secondaryStores: ['zenleaf'],
  brandLoyal: [],
  brandAvoid: ['Skip Brand Co'],
  dealTier: 'any',
  boughtBefore: {
    [neverUrl]: 'never',
    [flowerA]: 'rebuy'
  }
}).value;

assert(baseProfile.enabled === true, 'profile normalized');

const cacheEntries = [
  cacheRow(flowerA, {
    name: 'Limonene Eighth',
    brand: 'Keep Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 45,
    onSale: false,
    cannabinoids: { THC: 22, CBD: 0.1 },
    terpenes: [
      { name: 'Limonene', percentage: 0.8 },
      { name: 'Beta-Myrcene', percentage: 0.3 }
    ]
  }),
  cacheRow(flowerB, {
    name: 'Pinene Eighth',
    brand: 'Other Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 38,
    onSale: false,
    cannabinoids: { THC: 20, CBD: 0.2 },
    terpenes: [
      { name: 'Alpha-Pinene', percentage: 0.7 },
      { name: 'Beta-Myrcene', percentage: 0.2 }
    ]
  }),
  cacheRow(skipBrandUrl, {
    name: 'Skip Me',
    brand: 'Skip Brand Co',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 30,
    onSale: true,
    cannabinoids: { THC: 21, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: 1.0 }]
  }),
  cacheRow(neverUrl, {
    name: 'Never Again',
    brand: 'Keep Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 32,
    onSale: false,
    cannabinoids: { THC: 19, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: 0.9 }]
  }),
  cacheRow(saleUrl, {
    name: 'Sale Eighth',
    brand: 'Deal Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 28,
    onSale: true,
    cannabinoids: { THC: 18, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: 0.55 }]
  }),
  cacheRow(
    otherStoreUrl,
    {
      name: 'Other Store Flower',
      brand: 'ZL Brand',
      categoryKey: 'flower',
      weightText: '3.5g',
      price: 40,
      onSale: false,
      cannabinoids: { THC: 23, CBD: 0.1 },
      terpenes: [{ name: 'Limonene', percentage: 0.6 }]
    },
    now - 90 * 60 * 1000,
    'zenleaf'
  ),
  cacheRow(wrongFormUrl, {
    name: 'Vape Cart',
    brand: 'Keep Brand',
    categoryKey: 'vape',
    weightText: '1g',
    price: 40,
    onSale: false,
    cannabinoids: { THC: 70, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: 2.0 }]
  }),
  cacheRow('https://www.sunnyside.shop/product/pricey', {
    name: 'Pricey Eighth',
    brand: 'Keep Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: 90,
    onSale: false,
    cannabinoids: { THC: 22, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: 0.9 }]
  })
];

// Free gate
const locked = CSI.picks.rankPicks({
  profile: baseProfile,
  cacheEntries,
  isPro: false
});
assert(locked.status === 'locked', 'Free users are gated');
assert(!locked.picks.length, 'Free sees no picks');
assert(/Pro/i.test(locked.message || ''), 'Free upsell mentions Pro');

// Empty: profile off
const off = CSI.picks.rankPicks({
  profile: { enabled: false },
  cacheEntries,
  isPro: true
});
assert(off.status === 'profile_off', 'disabled profile empty state');
assert(/taste profile/i.test(off.message || ''), 'profile off tells shopper what to do');

// Empty: no stores
const noStores = CSI.picks.rankPicks({
  profile: { ...baseProfile, homeStore: null, secondaryStores: [] },
  cacheEntries,
  isPro: true
});
assert(noStores.status === 'no_stores', 'missing stores empty state');

// Empty: no cache for profile stores
const noCache = CSI.picks.rankPicks({
  profile: { ...baseProfile, homeStore: 'terravida', secondaryStores: [] },
  cacheEntries,
  isPro: true
});
assert(noCache.status === 'no_cache', 'missing cache empty state');
assert(/visit|menu|cache/i.test(noCache.message || ''), 'no-cache empty state is actionable');

// Happy path: filter then rank
const ranked = CSI.picks.rankPicks({
  profile: baseProfile,
  cacheEntries,
  isPro: true,
  now
});
assert(ranked.status === 'ok', 'pro ranked ok');
assert(ranked.picks.length >= 2, 'at least two picks');
const urls = ranked.picks.map((p) => p.url);
assert(!urls.includes(skipBrandUrl), 'skip brand excluded');
assert(!urls.includes(neverUrl), 'never-again excluded');
assert(!urls.includes(wrongFormUrl), 'wrong form excluded');
assert(!urls.includes('https://www.sunnyside.shop/product/pricey'), 'over budget excluded');
assert(urls.includes(flowerA), 'matching flower included');
assert(urls.includes(otherStoreUrl), 'secondary store cache included');

// Chem match: limonene-heavy listing should beat pinene-only when both pass filters
const idxA = urls.indexOf(flowerA);
const idxB = urls.indexOf(flowerB);
assert(idxA >= 0 && idxB >= 0, 'both chem candidates present');
assert(idxA < idxB, 'higher chem match ranks first');
assert(
  ranked.picks[idxA].reasons.some((r) => /Limonene|Chem match|Re-buy|re-buy/i.test(r)),
  'pick explains chem / rebuy reasons'
);

function boostFlower(url, name, limonenePct, extra = {}) {
  return cacheRow(url, {
    name,
    brand: extra.brand || 'Boost Brand',
    categoryKey: 'flower',
    weightText: '3.5g',
    price: extra.price ?? 40,
    onSale: false,
    cannabinoids: { THC: 20, CBD: 0.1 },
    terpenes: [{ name: 'Limonene', percentage: limonenePct }]
  });
}

const strongChemUrl = 'https://www.sunnyside.shop/product/strong-chem';
const weakRebuyUrl = 'https://www.sunnyside.shop/product/weak-rebuy';
const nearTiePlainUrl = 'https://www.sunnyside.shop/product/near-tie-plain';
const nearTieBoostUrl = 'https://www.sunnyside.shop/product/near-tie-boost';
const boostProfile = CSI.profile.normalize({
  ...baseProfile,
  brandLoyal: [],
  boughtBefore: {
    [weakRebuyUrl]: 'rebuy',
    [nearTieBoostUrl]: 'rebuy'
  }
}).value;
const boostRanked = CSI.picks.rankPicks({
  profile: boostProfile,
  cacheEntries: [
    boostFlower(strongChemUrl, 'Strong Chem', 0.8),
    boostFlower(weakRebuyUrl, 'Weak Rebuy', 0.1),
    boostFlower(nearTiePlainUrl, 'Near Tie Plain', 0.25),
    boostFlower(nearTieBoostUrl, 'Near Tie Boost', 0.22)
  ],
  isPro: true,
  now
});
assert(boostRanked.status === 'ok', 'soft-boost ranking ok');
const boostUrls = boostRanked.picks.map((p) => p.url);
assert(
  boostUrls.indexOf(strongChemUrl) < boostUrls.indexOf(weakRebuyUrl),
  'stronger chem match outranks a re-buy with weaker chem'
);
assert(
  boostUrls.indexOf(nearTieBoostUrl) < boostUrls.indexOf(nearTiePlainUrl),
  're-buy soft boost decides a near-tie chem match'
);
assert(
  ranked.picks.every((p) => p.listedNote === 'Listed, not guaranteed.'),
  'each pick notes listed-not-guaranteed'
);
assert(
  ranked.picks.every((p) => p.storeLabel && p.cacheAgeLabel),
  'each pick shows store and cache age'
);
assert(
  ranked.picks.every((p) => CSI.picks.allowlistedUrl(p.url)),
  'pick links stay on supported hosts'
);

// Deal preference: sale only
const saleOnly = CSI.picks.rankPicks({
  profile: { ...baseProfile, dealTier: 'sale', tripBudgetUsd: 100, boughtBefore: {} },
  cacheEntries,
  isPro: true,
  now
});
assert(saleOnly.status === 'ok', 'sale filter ok');
assert(
  saleOnly.picks.length && saleOnly.picks.every((p) => p.onSale),
  'sale preference keeps sale-listed only'
);
assert(
  saleOnly.picks.some((p) => p.url === saleUrl),
  'sale-listed pick present'
);
assert(
  !saleOnly.picks.some((p) => p.url === skipBrandUrl),
  'sale filter still excludes skip brands'
);

// Deal preference: below median (host medians provided)
const mediansByHost = {
  'sunnyside.shop': {
    host: 'sunnyside.shop',
    savedAt: now,
    categories: {
      flower: { median: 40, sampleCount: 8 }
    }
  }
};
const below = CSI.picks.rankPicks({
  profile: { ...baseProfile, dealTier: 'below-median', tripBudgetUsd: 100, boughtBefore: {} },
  cacheEntries,
  mediansByHost,
  isPro: true,
  now
});
assert(below.status === 'ok', 'below-median filter ok');
assert(
  below.picks.every((p) => p.price != null && p.price < 40),
  'below-median keeps prices under median'
);
assert(
  below.picks.every((p) => /sunnyside\.shop/i.test(p.url)),
  'below-median without other-host medians drops unverified hosts'
);

// Per-host medians under csi_category_medians: store B must not wipe store A
await CSI.storage.saveCategoryMedians({
  host: 'www.sunnyside.shop',
  adapterId: 'sunnyside',
  categories: { flower: { median: 40, sampleCount: 8 } }
});
await CSI.storage.saveCategoryMedians({
  host: 'zenleafdispensaries.com',
  adapterId: 'zenleaf',
  categories: { flower: { median: 45, sampleCount: 5 } }
});
const sunMedian = await CSI.storage.loadCategoryMedians('sunnyside.shop');
const zlMedian = await CSI.storage.loadCategoryMedians('www.zenleafdispensaries.com');
assert(sunMedian && sunMedian.categories.flower.median === 40, 'sunnyside median retained after other host save');
assert(zlMedian && zlMedian.categories.flower.median === 45, 'zenleaf median stored independently');
assert(sunMedian.host === 'sunnyside.shop', 'median host is www-normalized');
assert(
  store['csi_category_medians:sunnyside.shop'] &&
    store['csi_category_medians:zenleafdispensaries.com'],
  'each host has its own csi_category_medians:<host> key'
);

// Concurrent saves for different hosts must not drop either snapshot
await Promise.all([
  CSI.storage.saveCategoryMedians({
    host: 'curaleaf.com',
    adapterId: 'curaleaf',
    categories: { flower: { median: 50, sampleCount: 6 } }
  }),
  CSI.storage.saveCategoryMedians({
    host: 'www.rise-dispensaries.com',
    adapterId: 'rise',
    categories: { flower: { median: 55, sampleCount: 7 } }
  })
]);
const concurrentA = await CSI.storage.loadCategoryMedians('curaleaf.com');
const concurrentB = await CSI.storage.loadCategoryMedians('rise-dispensaries.com');
assert(concurrentA && concurrentA.categories.flower.median === 50, 'concurrent save keeps first host medians');
assert(concurrentB && concurrentB.categories.flower.median === 55, 'concurrent save keeps second host medians');
assert(
  store['csi_category_medians:curaleaf.com'] && store['csi_category_medians:rise-dispensaries.com'],
  'concurrent saves write independent per-host keys'
);

// loadAndRank resolves each cache host's median independently for below-median
for (const row of cacheEntries) {
  store[`csi_pdp:${row.url}`] = { fetchedAt: row.fetchedAt, data: row.data };
}
store.csi_taste_profile = {
  ...baseProfile,
  dealTier: 'below-median',
  tripBudgetUsd: 100,
  boughtBefore: {}
};
const multiHostBelow = await CSI.picks.loadAndRank({ isPro: true, now });
assert(multiHostBelow.status === 'ok', 'below-median loadAndRank ok with multi-host medians');
assert(
  multiHostBelow.picks.some((p) => p.url === otherStoreUrl),
  'secondary-store pick kept when its host median is present'
);
assert(
  multiHostBelow.picks.every((p) => {
    if (/sunnyside\.shop/i.test(p.url)) return p.price != null && p.price < 40;
    if (/zenleafdispensaries\.com/i.test(p.url)) return p.price != null && p.price < 45;
    return false;
  }),
  'each pick is below its own host median'
);

// Legacy flat snapshot still loads (migrates on read)
delete store['csi_category_medians:sunnyside.shop'];
store.csi_category_medians = {
  host: 'sunnyside.shop',
  adapterId: 'sunnyside',
  savedAt: now,
  categories: { flower: { median: 41, sampleCount: 4 } },
  products: []
};
const legacyMedian = await CSI.storage.loadCategoryMedians('www.sunnyside.shop');
assert(legacyMedian && legacyMedian.categories.flower.median === 41, 'legacy flat median snapshot still loads');
assert(
  store['csi_category_medians:sunnyside.shop']?.categories?.flower?.median === 41,
  'legacy flat snapshot migrates onto the per-host key'
);

delete store['csi_category_medians:sunnyside.shop'];
store.csi_category_medians = {
  byHost: {
    'sunnyside.shop': {
      host: 'sunnyside.shop',
      adapterId: 'sunnyside',
      savedAt: now,
      categories: { flower: { median: 42, sampleCount: 4 } },
      products: []
    }
  }
};
const byHostLegacy = await CSI.storage.loadCategoryMedians('www.sunnyside.shop');
assert(byHostLegacy && byHostLegacy.categories.flower.median === 42, 'legacy byHost blob still loads');

// Budget preference alone
const budgeted = CSI.picks.rankPicks({
  profile: { ...baseProfile, tripBudgetUsd: 39, dealTier: 'any', boughtBefore: {} },
  cacheEntries,
  isPro: true,
  now
});
assert(budgeted.status === 'ok', 'budget filter ok');
assert(
  budgeted.picks.every((p) => p.price != null && p.price <= 39),
  'budget excludes over-budget rows'
);

// Size / ratio helpers
assert(CSI.picks.productSizeKey({ weightText: '3.5 g' }) === '3.5g', 'size key 3.5g');
assert(
  CSI.picks.productRatioKey({ cannabinoids: { THC: 22, CBD: 0.2 } }) === 'thc-forward',
  'ratio thc-forward'
);
assert(CSI.picks.productPotencyBand({ cannabinoids: { THC: 22 } }) === '15-25', 'THC band');

// buildPdpCacheRecord persists onSale for later deal filters
const rec = CSI.buildPdpCacheRecord(
  {
    url: flowerA,
    name: 'Cached',
    price: 20,
    onSale: true,
    weightText: '3.5g',
    cannabinoids: { THC: 20 },
    terpenes: []
  },
  { adapterId: 'sunnyside', categoryKey: 'flower' }
);
assert(rec.onSale === true, 'cache record keeps onSale');

// Storage path: loadAndRank uses local cache only
store[`csi_pdp:${flowerA}`] = {
  fetchedAt: now - 1000,
  data: cacheEntries[0].data
};
store.csi_taste_profile = baseProfile;
const fromStorage = await CSI.picks.loadAndRank({ isPro: true, now });
assert(fromStorage.status === 'ok' || fromStorage.status === 'no_matches', 'loadAndRank uses storage');
assert(!Object.keys(store).some((k) => k.includes('sync')), 'no sync keys written');

// Host-page DOM safety: picks module must not write profile into dataset HTML
const picksSrc = fs.readFileSync(path.join(ext, 'lib/csi-picks.js'), 'utf8');
assert(!/dataset\.|data-csi-product-data|innerHTML|document\./.test(picksSrc), 'picks module is not host-DOM');
assert(!/chrome\.storage\.sync/.test(picksSrc), 'picks avoids sync storage');
assert(!/\bfetch\s*\(|XMLHttpRequest|sendMessage/.test(picksSrc), 'picks makes no network calls');

const popupHtml = fs.readFileSync(path.join(ext, 'popup/popup.html'), 'utf8');
assert(popupHtml.includes('csi-picks.js'), 'popup loads picks');
assert(popupHtml.includes('id="picks-section"'), 'popup has picks section');

const popupJs = fs.readFileSync(path.join(ext, 'popup/popup.js'), 'utf8');
assert(popupJs.includes('loadPicksUi'), 'popup wires picks UI');
assert(popupJs.includes('picksLoadVersion'), 'popup ignores stale picks loads');
assert(popupJs.includes('picks-upgrade') && popupJs.includes('openUpgrade'), 'Free upsell uses Upgrade');

const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.22', 'manifest 1.3.22');
assert(manifest.permissions.length === 1 && manifest.permissions[0] === 'storage', 'permissions unchanged');
const contentJs = manifest.content_scripts?.[1]?.js || [];
assert(!contentJs.includes('lib/csi-picks.js'), 'picks not injected into host pages');
assert(contentJs.includes('lib/csi-profile.js'), 'profile still available to content scripts');

// Simulate host-page product data sanitizer still strips profile
loadScripts(['lib/csi-fetch.js'], sandbox);
const hostEl = {
  dataset: {}
};
CSI.storeElementProduct(hostEl, {
  name: 'Leak test',
  tasteProfile: baseProfile,
  tasteMap: { preferredTerpenes: { Limonene: 1 } },
  cannabinoids: { THC: 20 }
});
const dumped = JSON.parse(hostEl.dataset.csiProductData);
assert(!dumped.tasteProfile, 'host DOM product data has no tasteProfile');
assert(!dumped.tasteMap, 'host DOM product data has no tasteMap');
assert(!JSON.stringify(dumped).includes('tripBudgetUsd'), 'profile fields absent from host DOM');
assert(!JSON.stringify(dumped).includes('brandAvoid'), 'brand prefs absent from host DOM');

const gates = fs.readFileSync(path.join(root, 'web/lib/feature-gates.ts'), 'utf8');
assert(gates.includes("'picksForYou'"), 'web feature-gates lists picksForYou');

console.log('smoke-picks: OK');

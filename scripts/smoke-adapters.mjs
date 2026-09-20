#!/usr/bin/env node
/**
 * Headless smoke checks for store adapters (no Chrome required).
 * Run: node scripts/smoke-adapters.mjs
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

class FakeDOMParser {
  parseFromString(html) {
    return {
      body: { textContent: html.replace(/<[^>]+>/g, ' '), innerText: html.replace(/<[^>]+>/g, ' ') },
      title: '',
      querySelector: () => null,
      querySelectorAll: () => []
    };
  }
}

const sandbox = {
  console,
  location: { href: 'https://www.sunnyside.shop/products/flower', hostname: 'www.sunnyside.shop', pathname: '/products/flower', search: '' },
  document: { querySelectorAll: () => [], querySelector: () => null, body: null },
  DOMParser: FakeDOMParser,
  URL,
  CSS: { escape: (s) => s },
  globalThis: null,
  window: null,
  chrome: undefined,
  localStorage: { getItem: () => null }
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
    'adapters/registry.js'
  ],
  vm.createContext(sandbox)
);

const CSI = sandbox.CSI;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// Registry order / resolve
assert(CSI.adapters.sunnyside, 'sunnyside registered');
assert(CSI.adapters.zenleaf, 'zenleaf registered');
assert(CSI.adapters.terravida, 'terravida registered');

const sy = CSI.registry.resolveAdapter('https://www.sunnyside.shop/products/flower');
assert(sy?.id === 'sunnyside', `expected sunnyside got ${sy?.id}`);
assert(sy.routeMode('/products/flower') === 'listing', 'sunnyside listing');
assert(sy.routeMode('/product/abc') === 'pdp', 'sunnyside pdp');
assert(sy.isAllowedFetchUrl('https://www.sunnyside.shop/product/123'), 'sunnyside fetch ok');
assert(!sy.isAllowedFetchUrl('https://evil.example/product/123'), 'sunnyside fetch block');

const zl = CSI.registry.resolveAdapter(
  'https://zenleafdispensaries.com/locations/abington/medical-menu/menu'
);
assert(zl?.id === 'zenleaf', `expected zenleaf got ${zl?.id}`);
assert(zl.routeMode('/locations/abington/medical-menu/menu') === 'listing', 'zl listing');
assert(
  zl.routeMode('/locations/abington/medical-menu/menu/vapes-1/foo-2') === 'pdp',
  'zl pdp'
);

const tv = CSI.registry.resolveAdapter(
  'https://zenleafdispensaries.com/locations/malvern/medical-menu/menu'
);
assert(tv?.id === 'terravida', `expected terravida on Malvern got ${tv?.id}`);
assert(tv.displayName.includes('TerraVida'), 'terravida display name');

const tvPdp = CSI.registry.resolveAdapter(
  'https://www.zenleafdispensaries.com/locations/malvern/recreational-menu/menu/flower-709/savvy-x-526093'
);
assert(tvPdp?.id === 'terravida', 'terravida pdp');

assert(
  !CSI.adapters.zenleaf.buildProductUrl('175458'),
  'zenleaf must not invent URL from bare id'
);
assert(
  CSI.adapters.zenleaf.buildProductUrl(
    '/locations/malvern/recreational-menu/menu/flower-709/savvy-x-526093'
  ),
  'zenleaf accepts full path'
);

// Parse sample labTests-ish HTML
const sampleHtml = `
<script>self.__next_f.push([1,"labTests\\":{\\"thc\\":{\\"value\\":[20.1,22.4],\\"unitAbbr\\":\\"%\\"},\\"cbd\\":null,\\"displayThc\\":{\\"value\\":[20.1,22.4],\\"unitAbbr\\":\\"%\\",\\"label\\":\\"THC\\"},\\"terpenes\\":{\\"value\\":[1.2,1.8],\\"unitAbbr\\":\\"%\\"},\\"tac\\":null},\\"saleType\\":\\"Both\\",\\"price\\":45,\\"promoPrice\\":32.5"])</script>
<h1>Test Flower</h1>
<p>THC : 20.1 - 22.4% TERP: 1.2 - 1.8%</p>
<p>Limonene 0.4% Myrcene 0.3%</p>
`;
const parsed = CSI.adapters.zenleaf.parseProductHtml(
  sampleHtml,
  'https://zenleafdispensaries.com/locations/malvern/recreational-menu/menu/flower-709/x-1'
);
assert(parsed.cannabinoids?.THC > 20 && parsed.cannabinoids.THC < 23, `thc ${parsed.cannabinoids?.THC}`);
assert(parsed.price === 32.5 || parsed.price === 45, `price ${parsed.price}`);
assert(parsed.onSale === true, 'sale from promoPrice');

// Sunnyside HTML scrape
const syHtml = `<html><body><h1>Widget</h1><p>THC: 25.5%</p><h3>Terpenes</h3><div>Limonene 0.55% Beta-Myrcene 0.22%</div></body></html>`;
const syParsed = CSI.adapters.sunnyside.parseProductHtml(
  syHtml,
  'https://www.sunnyside.shop/product/1'
);
assert(String(syParsed.cannabinoids.THC) === '25.5', 'sy thc');
assert(
  Array.isArray(syParsed.terpenes) && syParsed.terpenes.some((t) => t.name === 'Limonene'),
  'sy limonene'
);

// Manifest hosts
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.8', 'version bump');

const mockCard = {
  textContent: 'Blue Dream THC 24.5% $45',
  querySelector: () => null,
  closest: () => null,
  parentElement: null
};
assert(
  sy.shouldSuppressListingCannabinoidBadges(mockCard) === true,
  'sunnyside suppresses duplicate THC listing badge'
);
assert(
  sy.shouldSuppressListingCannabinoidBadges({ textContent: 'Mystery strain $40', querySelector: () => null, closest: () => null, parentElement: null }) === false,
  'sunnyside shows THC badge when retail omits potency'
);
assert(sy.pdpChemSurface === 'floating-panel', 'sunnyside PDP chem is floating panel only');
assert(
  manifest.host_permissions.includes('https://zenleafdispensaries.com/*'),
  'zenleaf host perm'
);
assert(
  manifest.host_permissions.includes('https://cannabissage.app/*'),
  'prod API host perm (custom domain)'
);
assert(
  manifest.host_permissions.includes('https://cannabissage.vercel.app/*'),
  'prod API host perm (vercel fallback)'
);
assert(
  !manifest.host_permissions.some((h) => /terravidahc|terravida\.com/.test(h)),
  'no bogus TerraVida ecommerce host'
);

// Denylist wiring (v1.3.6)
assert(
  fs.existsSync(path.join(ext, 'lib/csi-denylist.js')),
  'csi-denylist.js present'
);
assert(
  manifest.content_scripts?.[1]?.js?.includes('lib/csi-denylist.js'),
  'denylist content script listed'
);
const cfg = JSON.parse(fs.readFileSync(path.join(ext, 'data/config.json'), 'utf8'));
assert(cfg.denylistPath === '/denylist.json', 'denylistPath in config');
const denylistPublic = path.join(root, 'web', 'public', 'denylist.json');
assert(fs.existsSync(denylistPublic), 'web/public/denylist.json');
const denyDoc = JSON.parse(fs.readFileSync(denylistPublic, 'utf8'));
assert(Array.isArray(denyDoc.hosts), 'denylist hosts array');
assert(denyDoc.hosts.length === 0, 'default denylist empty (fail-open)');

// What CannabisSage adds chip (v1.3.7) — listing chrome + PDP header, not per-card
loadScripts(['lib/csi-ui.js'], sandbox);
assert(CSI.VERSION === '1.3.8', 'core version 1.3.8');
const adds = CSI.ui.WHAT_SAGE_ADDS;
const addsCopy = `${adds.summary} ${adds.detail}`;
assert(/chem badges/i.test(addsCopy) && /compare/i.test(addsCopy), 'chip mentions badges and compare');
assert(/Pro tools/i.test(adds.detail), 'expand mentions Pro tools');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida/i.test(addsCopy), 'no retailer brand in chip copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(addsCopy),
  'no medical or effects claims in chip copy'
);
const chipHtml = CSI.ui.buildWhatSageAddsChip();
assert(chipHtml.includes('data-csi-adds="1"'), 'chip marker');
assert(chipHtml.includes('<summary>'), 'one-line summary');
assert(chipHtml.includes('csi-adds-detail'), 'optional expand');
assert(!/<button|openUpgrade|Upgrade/i.test(chipHtml), 'chip has no Pro CTA button');
const headerHtml = CSI.ui.buildPdpHeader({ showClose: true });
assert(headerHtml.includes('csi-pdp-header') && headerHtml.includes('data-csi-adds="1"'), 'chip in PDP header');
assert(headerHtml.includes('csi-pdp-close'), 'PDP close stays in header');
const cardBadges = CSI.ui.buildListingBadgeChips({ product: { cannabinoids: { THC: 20 } }, status: 'ok' });
assert(!cardBadges.join('').includes('data-csi-adds'), 'chip is not a per-card badge');

const listingSrc = fs.readFileSync(path.join(ext, 'content-listing.js'), 'utf8');
const pdpSrc = fs.readFileSync(path.join(ext, 'content-pdp.js'), 'utf8');
assert(listingSrc.includes('${CSI.ui.buildWhatSageAddsChip()}'), 'listing filter bar mounts chip');
const renderBadgesFn = listingSrc.slice(
  listingSrc.indexOf('function renderBadges'),
  listingSrc.indexOf('async function enrichCard')
);
assert(!renderBadgesFn.includes('buildWhatSageAddsChip'), 'listing badges stay chem-only');
assert(pdpSrc.includes('CSI.ui.buildPdpHeader({ showClose: true })'), 'loaded PDP uses header helper');
assert(pdpSrc.includes('CSI.ui.buildPdpHeader({ showClose: false })'), 'loading PDP includes chip');
assert(pdpSrc.includes('clearPdpBuyboxChemInject'), 'PDP still refuses buy-column chem');

// Compare tray terpene overlap (v1.3.8) — free, quiet empty/error, no brand or effects copy
const COPY = CSI.ui.TERP_OVERLAP_COPY;
const overlapCopy = Object.values(COPY).join(' ');
assert(COPY.title === 'Terpene overlap', 'overlap title');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida/i.test(overlapCopy), 'no retailer brand in overlap copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(overlapCopy),
  'no medical or effects claims in overlap copy'
);
const uiSrc = fs.readFileSync(path.join(ext, 'lib/csi-ui.js'), 'utf8');
const overlapSrc = uiSrc.slice(uiSrc.indexOf('const TERP_OVERLAP_COPY'), uiSrc.indexOf('async function copyText'));
assert(overlapSrc.includes('function summarizeTerpeneOverlap'), 'overlap summary lives in ui');
assert(!/openUpgrade|features\?\s*\.\s*can|hasPro\(/.test(overlapSrc), 'overlap is not a Pro gate');
assert(!overlapSrc.includes('csi-status-error'), 'overlap does not use the error banner');
assert(uiSrc.includes('renderTerpeneOverlap(container, productData)'), 'sidebar renders overlap above the table');
const featuresSrc = fs.readFileSync(path.join(ext, 'lib/csi-features.js'), 'utf8');
assert(/compareTray:\s*true/.test(featuresSrc), 'compare stays free');

const sharedPair = CSI.ui.summarizeTerpeneOverlap([
  {
    name: 'Alpha',
    status: 'ok',
    terpenes: [
      { name: 'Limonene', percentage: 0.4 },
      { name: 'Myrcene', percentage: 0.2 }
    ]
  },
  { name: 'Beta', status: 'ok', terpenes: { limonene: '0.5%', Pinene: 0.1 } }
]);
assert(sharedPair.shared.length === 1 && sharedPair.shared[0] === 'Limonene', `shared ${sharedPair.shared}`);
assert(
  sharedPair.unique.some((u) => u.name === 'Beta-Myrcene' && u.label === 'Alpha'),
  'unique myrcene on first pick'
);
assert(
  sharedPair.unique.some((u) => u.name === 'Alpha-Pinene' && u.label === 'Beta'),
  'unique pinene on second pick'
);
assert(sharedPair.note === '', 'no empty note when a terpene is shared');

const partial = CSI.ui.summarizeTerpeneOverlap([
  { name: 'A', status: 'ok', terpenes: { Limonene: 1, Myrcene: 0.2, Pinene: 0.1 } },
  { name: 'B', status: 'ok', terpenes: { Limonene: 0.4, Myrcene: 0.3 } },
  { name: 'C', status: 'ok', terpenes: { Limonene: 0.2 } }
]);
assert(partial.shared.join(',') === 'Limonene', 'three-pick shared is limonene only');
assert(
  partial.partial.some((p) => p.name === 'Beta-Myrcene' && p.count === 2 && p.total === 3),
  'myrcene is on some, not shared'
);
assert(partial.unique.some((u) => u.name === 'Alpha-Pinene' && u.label === 'A'), 'pinene only on one');

const totalsOnly = CSI.ui.summarizeTerpeneOverlap([
  { name: 'A', status: 'ok', terpenes: { 'Total Terpenes': 1.2 } },
  { name: 'B', status: 'empty', terpenes: { 'Total Terpenes': 0 } }
]);
assert(totalsOnly.shared.length === 0 && totalsOnly.unique.length === 0, 'total-only is not a named terpene');
assert(totalsOnly.note === COPY.noneNamed, 'quiet note when nothing named is listed');

assert(
  CSI.ui.summarizeTerpeneOverlap([{ name: 'A', status: 'ok', terpenes: { Limonene: 1 } }]).note ===
    COPY.needAnother,
  'one pick asks for another, quietly'
);
assert(
  CSI.ui.summarizeTerpeneOverlap([
    { name: 'A', status: 'error', terpenes: { Limonene: 1 }, url: 'https://www.sunnyside.shop/product/1' },
    { name: 'B', status: 'error', fetchError: 'Fetch failed https://zenleafdispensaries.com/x' }
  ]).note === COPY.allFailed,
  'all failed stays a calm note and does not echo urls'
);

const mixed = CSI.ui.summarizeTerpeneOverlap([
  { name: 'A', status: 'ok', terpenes: { Limonene: 1, Myrcene: 0.2 } },
  { name: 'B', status: 'ok', terpenes: { Limonene: 0.4 } },
  { name: 'C', status: 'error', url: 'https://www.sunnyside.shop/product/9', terpenes: { Pinene: 1 } }
]);
assert(mixed.shared.includes('Limonene'), 'shared ignores the failed pick');
assert(!mixed.unique.some((u) => u.name === 'Alpha-Pinene'), 'failed pick terpenes are not unique');
assert(mixed.unique.some((u) => u.name === 'Beta-Myrcene' && u.label === 'A'), 'unique among loaded picks');
assert(mixed.note === COPY.oneFailed, 'quiet note that overlap uses loaded picks');
assert(!/sunnyside|zenleaf/i.test(mixed.note), 'failed note has no retailer host');

const noCommon = CSI.ui.summarizeTerpeneOverlap([
  { name: 'A', status: 'ok', terpenes: { Limonene: 0 } },
  { name: 'B', status: 'ok', terpenes: { Limonene: 0.4, Myrcene: 0.2 } }
]);
assert(!noCommon.shared.includes('Limonene'), 'zero percent is not shared');
assert(noCommon.note === COPY.noneShared, 'quiet note when nothing is in common');

console.log('smoke-adapters: OK');

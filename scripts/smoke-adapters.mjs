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
assert(!parsed.provenance, 'zenleaf potency sample has no provenance');

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
assert(!syParsed.provenance, 'sunnyside chem html has no provenance');

// Manifest hosts
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.10', 'version bump');

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
assert(CSI.VERSION === '1.3.10', 'core version 1.3.10');
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

// Deal vs category median (v1.3.9) — real price + real median only; dealBadges stays Pro
assert(CSI.MIN_CATEGORY_PRICE_SAMPLE === 3, 'median needs at least 3 listed prices');
assert(CSI.categoryKeyFromPath('/products/flower') === 'flower', 'sunnyside category path');
assert(CSI.categoryKeyFromPath('/product/abc') === null, 'pdp url is not a category');
assert(CSI.categoryKeyFromPath('/locations/abington/medical-menu/menu') === null, 'mixed menu is not one category');
assert(
  CSI.categoryKeyFromPath('/locations/malvern/recreational-menu/menu/flower-709/savvy-x') === 'flower',
  'menu product path yields flower'
);
assert(CSI.categoryKeyFromPath('/products/all') === null, 'all is not a category bucket');
assert(CSI.positivePrice(null) === null && CSI.positivePrice(0) === null && CSI.positivePrice('nope') === null, 'missing price stays missing');
assert(CSI.positivePrice('32.50') === 32.5, 'numeric string price is accepted');

const thin = CSI.summarizeCategoryPriceMedians([
  { categoryKey: 'flower', price: 40, url: 'https://example.test/a' },
  { categoryKey: 'flower', price: 50, url: 'https://example.test/b' }
]);
assert(Object.keys(thin).length === 0, 'two prices is not a median');
assert(CSI.dealVsCategoryMedian(40, 50, 2) === null, 'short sample does not flag');
assert(CSI.dealVsCategoryMedian(null, 50, 5) === null, 'missing price does not flag');
assert(CSI.dealVsCategoryMedian(40, null, 5) === null, 'missing median does not flag');
assert(CSI.dealVsCategoryMedian(40, 40, 5) === null, 'price equal to median is not a deal');
assert(CSI.dealVsCategoryMedian(55, 40, 5) === null, 'price above median is not a deal');

const medians = CSI.summarizeCategoryPriceMedians([
  { categoryKey: 'flower', price: 10, url: 'https://example.test/1' },
  { categoryKey: 'flower', price: 10, url: 'https://example.test/1' },
  { categoryKey: 'flower', price: 30, url: 'https://example.test/2' },
  { categoryKey: 'flower', price: 50, url: 'https://example.test/3' },
  { categoryKey: 'vapes', price: 20 },
  { categoryKey: '', price: 5 },
  { categoryKey: 'edibles', price: null }
]);
assert(medians.flower.sampleCount === 3, 'duplicate url counts once');
assert(medians.flower.median === 30, `flower median ${medians.flower && medians.flower.median}`);
assert(!medians.vapes, 'one vape price is omitted');
assert(!medians.edibles, 'missing edible price is omitted');
const below = CSI.dealVsCategoryMedian(10, medians.flower.median, medians.flower.sampleCount);
assert(below && below.price === 10 && below.categoryMedian === 30 && below.sampleCount === 3, 'below median flag uses the scraped numbers');
const even = CSI.medianOfPrices([10, 20, 30, 40]);
assert(even === 25, `even median ${even}`);

const dealCopy = Object.values(CSI.ui.DEAL_VS_MEDIAN_COPY).join(' ');
assert(CSI.ui.DEAL_VS_MEDIAN_COPY.badge === 'Below median', 'badge label');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida/i.test(dealCopy), 'no retailer brand in median copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(dealCopy),
  'no medical or effects claims in median copy'
);
assert(!/%/.test(dealCopy), 'copy does not invent a percent off');
assert(CSI.ui.buildDealVsMedianBadge(null) === '', 'no badge without a flag');
assert(CSI.ui.buildDealVsMedianBadge({ price: 10, categoryMedian: 30, sampleCount: 2 }) === '', 'no badge on a short sample');
assert(CSI.ui.buildDealVsMedianStrip(null) === '', 'no strip without a flag');
const badgeHtml = CSI.ui.buildDealVsMedianBadge(below);
assert(badgeHtml.includes('data-csi-deal-median="1"'), 'median badge marker');
assert(badgeHtml.includes('Below median'), 'median badge text');
assert(badgeHtml.includes('Listed $10.00') && badgeHtml.includes('median $30.00') && badgeHtml.includes('3 listed prices'), 'title repeats real figures only');
assert(!/% off|save \$/i.test(badgeHtml), 'badge does not invent savings');
const stripHtml = CSI.ui.buildDealVsMedianStrip(below);
assert(stripHtml.includes('csi-deal-median') && stripHtml.includes(CSI.ui.DEAL_VS_MEDIAN_COPY.strip), 'pdp strip');

const medianProduct = {
  cannabinoids: { THC: 22 },
  belowCategoryMedian: below,
  onSale: true,
  dollarsPerMg: 0.12
};
sandbox.CSI.features = { can: (id) => id === 'dealBadges' };
const proChips = CSI.ui.buildListingBadgeChips({ product: medianProduct, status: 'ok' });
assert(proChips.join('').includes('data-csi-deal-median="1"'), 'pro listing shows median badge');
assert(proChips.join('').includes('THC'), 'pro chem badge still renders');
sandbox.CSI.features = { can: () => false };
const freeChips = CSI.ui.buildListingBadgeChips({ product: medianProduct, status: 'ok' });
assert(!freeChips.join('').includes('data-csi-deal-median'), 'free omits median badge');
assert(!freeChips.join('').includes('>Sale<'), 'free still omits sale badge');
assert(freeChips.join('').includes('THC 22.0%'), 'free chem badge is not gated by deals');
delete sandbox.CSI.features;

const refreshSrc = listingSrc.slice(
  listingSrc.indexOf('async function refreshCategoryDealFlags'),
  listingSrc.indexOf('function normalizeCompareUrl')
);
assert(refreshSrc.includes('summarizeCategoryPriceMedians'), 'listing median is computed from card prices');
assert(refreshSrc.includes("can?.('dealBadges')"), 'median flag stays behind dealBadges');
assert(refreshSrc.includes('csiEnriching'), 'in-flight cards keep their loading badges');
assert(refreshSrc.includes('stillEnriching'), 'menu median is saved after listing prices settle');
assert(!/openUpgrade/.test(refreshSrc), 'missing median does not nag to upgrade');
assert(pdpSrc.includes('buildDealVsMedianBadge'), 'pdp uses the shared badge');
assert(pdpSrc.includes('buildDealVsMedianStrip'), 'pdp strip');
assert(pdpSrc.includes("can?.('dealBadges')"), 'pdp median stays behind dealBadges');
const attachSrc = pdpSrc.slice(pdpSrc.indexOf('async function attachDealVsMedian'), pdpSrc.indexOf('function clearPdpBuyboxChemInject'));
assert(attachSrc.includes('loadCategoryMedians'), 'pdp reads a saved menu median');
assert(!/openUpgrade/.test(attachSrc), 'pdp omit path has no upgrade wall');
const featuresSrcDeal = fs.readFileSync(path.join(ext, 'lib/csi-features.js'), 'utf8');
assert(/dealBadges:\s*true/.test(featuresSrcDeal), 'dealBadges remains a pro feature');
assert(/basicBadges:\s*true/.test(featuresSrcDeal), 'basic chem badges remain free');
const gatesSrc = fs.readFileSync(path.join(root, 'web', 'lib', 'feature-gates.ts'), 'utf8');
assert(gatesSrc.includes("'dealBadges'"), 'landing gates still list dealBadges');
assert(gatesSrc.includes('basicBadges'), 'landing gates still list basicBadges as free');

// Provenance strip (v1.3.10) — only fields the adapter payload actually has
assert(CSI.readProvenance(null) === null, 'missing payload is not provenance');
assert(
  CSI.readProvenance({
    labTests: { displayThc: { label: 'THC', value: [20.1, 22.4] }, thc: { label: 'THCA' } },
    sourceUrl: 'https://cdn.example/photo.png',
    brand: { name: 'Savvy' },
    startDate: '2024-01-01',
    endDate: '2024-02-01',
    updated_ago: '2 days ago',
    created_ago: '1 hour ago',
    exp_date: '2027-01-01'
  }) === null,
  'potency label, image url, brand, promo date, relative time, and expiration are not provenance'
);
assert(CSI.readProvenance({ source_sku: '   ' }) === null, 'blank menu source is omitted');
assert(CSI.readProvenance({ source_sku: 'Sunnyside' }) === null, 'retailer name is not a menu source');
assert(CSI.readProvenance({ labName: 'Zen Leaf' }) === null, 'retailer name is not a lab');
assert(CSI.readProvenance({ mfg_date: 'not-a-date' }) === null, 'unparseable date is omitted');
assert(CSI.readProvenance({ mfg_date: '2025-02-31' }) === null, 'impossible calendar date is omitted');
assert(CSI.scrapeProvenanceFromHtml('displayThc\\":{\\"label\\":\\"THC\\"}') === null, 'scraped potency label is not a lab');
assert(
  CSI.scrapeProvenanceFromHtml('sourceUrl\\":\\"https://cdn.example/a.png\\"') === null,
  'scraped image sourceUrl is not a menu source'
);
assert(CSI.scrapeProvenanceFromHtml('startDate\\":\\"2024-01-01\\"') === null, 'scraped promo start is not a timestamp');

const packaged = CSI.readProvenance({
  source_sku: 'SKU-9',
  mfg_date: '2026-03-04',
  labTests: { displayThc: { label: 'THC', value: [80] } }
});
assert(packaged && packaged.source === 'SKU-9', 'sunnyside source_sku is the menu source');
assert(packaged.timestamp === '2026-03-04' && packaged.timestampKind === 'packaged', 'mfg_date is packaged, not tested');
assert(!packaged.lab, 'potency label did not become a lab');

const tested = CSI.readProvenance({
  labTests: {
    displayThc: { label: 'THCA', value: [22] },
    testedAt: '2025-12-01T15:04:00Z',
    labName: 'Keystone Lab'
  },
  startDate: '2020-01-01',
  sourceUrl: 'https://cdn.example/a.png',
  brand: { name: 'Savvy' }
});
assert(tested && tested.lab === 'Keystone Lab', 'lab name comes from labTests.labName');
assert(tested.timestamp === '2025-12-01' && tested.timestampKind === 'tested', 'testedAt keeps the calendar date');
assert(!tested.source, 'image sourceUrl and brand are not a menu source');

const preferTested = CSI.mergeProvenance(
  { source_sku: 'SKU-9', mfg_date: '2026-03-04' },
  { testedAt: '2025-11-02', labName: 'Keystone Lab' }
);
assert(preferTested.source === 'SKU-9' && preferTested.lab === 'Keystone Lab', 'merge keeps source and lab');
assert(preferTested.timestamp === '2025-11-02' && preferTested.timestampKind === 'tested', 'a real test date wins over packaged');
assert(CSI.mergeProvenance(null, null) === null, 'merge of nothing is nothing');

const embedded = CSI.scrapeProvenanceFromHtml(
  'prefix labTests\\":{\\"labName\\":\\"Keystone Lab\\",\\"testedAt\\":\\"2025-11-02\\",\\"label\\":\\"THC\\"} tail'
);
assert(embedded && embedded.lab === 'Keystone Lab' && embedded.timestampKind === 'tested', 'escaped payload lab and test date');
const syEmbedded = CSI.adapters.sunnyside.parseProductHtml(
  '<html><body><h1>Widget</h1><script>{"source_sku":"SKU-9","mfg_date":"2026-03-04"}</script><p>THC: 1%</p></body></html>',
  'https://www.sunnyside.shop/product/1'
);
assert(syEmbedded.provenance && syEmbedded.provenance.source === 'SKU-9', 'sunnyside html keeps source_sku when present');
assert(syEmbedded.provenance.timestampKind === 'packaged', 'sunnyside html mfg_date is packaged');
const zlEmbedded = CSI.adapters.zenleaf.parseProductHtml(
  '<script>labTests\\":{\\"thc\\":{\\"value\\":[10],\\"unitAbbr\\":\\"%\\"},\\"labName\\":\\"Keystone Lab\\",\\"testedAt\\":\\"2025-11-02\\"},\\"saleType\\":\\"Both\\"</script>',
  'https://zenleafdispensaries.com/locations/malvern/recreational-menu/menu/flower-709/x-1'
);
assert(zlEmbedded.provenance && zlEmbedded.provenance.lab === 'Keystone Lab', 'zenleaf html lab name when the key exists');
assert(zlEmbedded.provenance.timestamp === '2025-11-02', 'zenleaf html testedAt when the key exists');

const provCopy = Object.values(CSI.ui.PROVENANCE_COPY).join(' ');
assert(CSI.ui.PROVENANCE_COPY.source === 'Menu source', 'generic menu source label');
assert(CSI.ui.PROVENANCE_COPY.lab === 'Lab', 'generic lab label');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida|savvy/i.test(provCopy), 'no retailer or product brand in provenance copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(provCopy),
  'no medical or effects claims in provenance copy'
);
assert(CSI.ui.buildProvenanceStrip(null) === '', 'no strip when provenance is missing');
assert(CSI.ui.buildProvenanceStrip({ source_sku: '   ' }) === '', 'no strip for a blank source');
const sourceOnly = CSI.ui.buildProvenanceStrip({ source_sku: 'SKU-9' });
assert(sourceOnly.includes('data-csi-provenance="1"') && sourceOnly.includes('Menu source SKU-9'), 'pdp shows menu source');
assert(!sourceOnly.includes('Lab') && !sourceOnly.includes('Tested') && !sourceOnly.includes('Packaged'), 'absent lab and date are omitted');
assert(CSI.ui.buildProvenanceListingNote({ source_sku: 'SKU-9' }) === '', 'listing stays quiet for source id alone');
const listingNote = CSI.ui.buildProvenanceListingNote(packaged);
assert(listingNote.includes('csi-provenance-listing'), 'listing note when a date is present');
assert(listingNote.includes('Menu source SKU-9') && listingNote.includes('Packaged 2026-03-04'), 'quiet line can include source with the date');
assert(!listingNote.includes('Tested'), 'packaged date is not called a test');
const labStrip = CSI.ui.buildProvenanceStrip(tested);
assert(labStrip.includes('Lab Keystone Lab') && labStrip.includes('Tested 2025-12-01'), 'lab and test date on the strip');
assert(!/sunnyside|zenleaf|savvy|https?:/i.test(labStrip), 'strip does not echo a brand or image url');
assert(!/>Sale</.test(labStrip) && !/badge/.test(labStrip), 'provenance is not a deal badge');

const provUi = uiSrc.slice(uiSrc.indexOf('const PROVENANCE_COPY'), uiSrc.indexOf('let tooltipEl'));
assert(!/features\?\s*\.\s*can|hasPro\(|openUpgrade|dealBadges/.test(provUi), 'provenance is not a Pro gate');
assert(pdpSrc.includes('buildProvenanceStrip(product.provenance)'), 'pdp panel renders the strip');
assert(pdpSrc.includes('clearPdpBuyboxChemInject'), 'provenance does not move chem into the buy column');
const renderBadgesNow = listingSrc.slice(
  listingSrc.indexOf('function renderBadges'),
  listingSrc.indexOf('async function enrichCard')
);
assert(renderBadgesNow.includes('buildProvenanceListingNote'), 'listing note is separate from chem chips');
assert(!renderBadgesNow.includes('buildWhatSageAddsChip'), 'listing badges stay chem-only plus quiet provenance');
const badgeFn = uiSrc.slice(uiSrc.indexOf('function buildListingBadgeChips'), uiSrc.indexOf('function buildTooltipContent'));
assert(!badgeFn.includes('buildProvenance') && !badgeFn.includes('data-csi-provenance'), 'provenance is not a colored card badge');

const bridgeSrc = fs.readFileSync(path.join(ext, 'bridge.js'), 'utf8');
const bridgeProv = bridgeSrc.slice(bridgeSrc.indexOf('function provenanceRaw'), bridgeSrc.indexOf('function summarizeSunnyside'));
assert(bridgeProv.includes('source_sku') && bridgeProv.includes('mfg_date'), 'bridge forwards sunnyside source and packaged date');
assert(bridgeProv.includes('labName') && bridgeProv.includes('testedAt'), 'bridge forwards lab name and test date when present');
assert(!bridgeProv.includes('displayThc') && !bridgeProv.includes('sourceUrl'), 'bridge does not treat potency or image urls as provenance');
assert(!/startDate|updated_ago|exp_date|brand/.test(bridgeProv), 'bridge does not forward promo, relative, expiry, or brand fields');

console.log('smoke-adapters: OK');

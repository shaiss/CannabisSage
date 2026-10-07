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
    'adapters/iheartjane.js',
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
assert(CSI.adapters.iheartjane, 'iheartjane registered');
assert(
  CSI.registry.BUILTIN_ORDER.indexOf('iheartjane') > CSI.registry.BUILTIN_ORDER.indexOf('zenleaf'),
  'iheartjane after zenleaf'
);

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

const janeListing =
  'https://risecannabis.com/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/';
const jane = CSI.registry.resolveAdapter(janeListing);
assert(jane?.id === 'iheartjane', `expected iheartjane got ${jane?.id}`);
assert(jane.displayName === 'RISE', `rise displayName ${jane.displayName}`);
assert(
  jane.routeMode('/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/') === 'listing',
  'jane listing route'
);
assert(
  jane.routeMode(
    '/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/product/2778500/modern-flower-skunk-hero/'
  ) === 'pdp',
  'jane pdp route'
);
assert(
  jane.isAllowedFetchUrl(
    'https://risecannabis.com/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/product/2778500/modern-flower-skunk-hero/'
  ),
  'jane fetch ok'
);
assert(!jane.isAllowedFetchUrl('https://risecannabis.com/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/'), 'jane listing not fetchable');
assert(!jane.isAllowedFetchUrl('https://evil.example/product/1'), 'jane fetch block');
assert(
  !jane.buildProductUrl('2778500'),
  'jane must not invent URL from bare id'
);
assert(
  jane.buildProductUrl(
    '/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/product/2778500/modern-flower-skunk-hero/'
  ),
  'jane accepts full path'
);
const janeSibling = CSI.registry.resolveAdapter(
  'https://www.risecannabis.com/dispensaries/pennsylvania/philadelphia/5383/medical-menu/'
);
assert(janeSibling?.id === 'iheartjane', 'sibling RISE store uses iheartjane');

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

// iHeartJane / RISE flight-payload sample (verified shape from live KoP PDP HTML)
const janeHtml = `
<script>self.__next_f.push([1,"7:[\\"$\",\\"div\\",null,{\\"percentThc\\":28.48,\\"inventoryPotencies\\":[{\\"price_id\\":\\"quarter_ounce\\",\\"cbd_potency\\":0,\\"tac_potency\\":0,\\"thc_potency\\":28.48,\\"thca_potency\\":0}],\\"productSizes\\":[{\\"label\\":\\"7g\\",\\"name\\":\\"quarter_ounce\\",\\"value\\":2778500}],\\"productDescription\\":\\"Caryophyllene: 0.418% | Humulene: 0.123% | Limonene\\\\u00a0: 0.48% | Ocimene\\\\u00a0: 0.0% | Linalool\\\\u00a0: 0.311% | Myrcene\\\\u00a0: 0.313% | Terpinolene\\\\u00a0: 0.006% | Bisabolol\\\\u00a0: 0.061% | Pinene\\\\u00a0: 0.038% | b-Pinene\\\\u00a0: 0.07% | \\\\\\\\r\\\\\\\\n--\\\\\\\\r\\\\\\\\nAll Modern Flower Cannabis products start with flower.\\",\\"price\\":28,\\"originalPrice\\":40,\\"offerText\\":\\"30% off - Storewide!\\",\\"name\\":\\"Skunk Hero\\",\\"offerTextForSegmentEvent\\":\\"30% off - Storewide!\\",\\"productId\\":2778500,\\"storeId\\":1552}]"])</script>
<span data-testid="product-card-potency-2778500">Total THC 28.48%</span>
`;
const janeParsed = CSI.adapters.iheartjane.parseProductHtml(
  janeHtml,
  'https://risecannabis.com/dispensaries/pennsylvania/king-of-prussia/1552/medical-menu/product/2778500/modern-flower-skunk-hero/'
);
assert(janeParsed.cannabinoids?.THC === 28.48, `jane thc ${janeParsed.cannabinoids?.THC}`);
assert(janeParsed.price === 28, `jane price ${janeParsed.price}`);
assert(janeParsed.onSale === true, 'jane sale from offer/original');
assert(janeParsed.weightText === '7g', `jane weight ${janeParsed.weightText}`);
assert(janeParsed.name === 'Skunk Hero', `jane name ${janeParsed.name}`);
assert(
  Array.isArray(janeParsed.terpenes) &&
    janeParsed.terpenes.some((t) => t.name === 'Beta-Caryophyllene' && t.percentage === 0.418),
  'jane caryophyllene percent'
);
assert(
  janeParsed.terpenes.some((t) => t.name === 'Beta-Myrcene' && t.percentage === 0.313),
  'jane myrcene percent'
);
assert(
  janeParsed.terpenes.some((t) => t.name === 'Beta-Pinene' && t.percentage === 0.07),
  'jane b-pinene percent'
);
assert(
  !janeParsed.terpenes.some((t) => t.name === 'Ocimene'),
  'jane skips zero-percent ocimene'
);
assert(janeParsed.provenance?.source === '2778500', 'jane menu source is product id');
assert(jane.bridgeStrategy === 'none', 'jane bridge is none');
assert(jane.pdpChemSurface === 'floating-panel', 'jane PDP chem is floating panel');
assert(
  jane.shouldSuppressListingCannabinoidBadges({
    textContent: 'Black Maple Total THC 46.24% $45.50/ea',
    querySelector: (sel) =>
      String(sel).includes('product-card-potency')
        ? { textContent: 'Total THC 46.24%' }
        : null,
    closest: () => null
  }) === true,
  'jane suppresses duplicate THC listing badge'
);

// Manifest hosts
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.21', 'version bump');

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
assert(cfg.partnersPath === '/partners.json', 'partnersPath in config');
const denylistPublic = path.join(root, 'web', 'public', 'denylist.json');
assert(fs.existsSync(denylistPublic), 'web/public/denylist.json');
const denyDoc = JSON.parse(fs.readFileSync(denylistPublic, 'utf8'));
assert(Array.isArray(denyDoc.hosts), 'denylist hosts array');
assert(denyDoc.hosts.length === 0, 'default denylist empty (fail-open)');
const partnersPublic = path.join(root, 'web', 'public', 'partners.json');
assert(fs.existsSync(partnersPublic), 'web/public/partners.json');
const partnersDoc = JSON.parse(fs.readFileSync(partnersPublic, 'utf8'));
assert(Array.isArray(partnersDoc.partners), 'partners array');
assert(
  partnersDoc.partners.every((p) => p.status === 'community'),
  'seed partners community (not verified)'
);
assert(
  fs.existsSync(path.join(ext, 'lib/csi-partners.js')),
  'csi-partners.js present'
);
assert(
  manifest.content_scripts?.[1]?.js?.includes('lib/csi-partners.js'),
  'partners content script listed'
);

// What CannabisSage adds chip (v1.3.7) — listing chrome + PDP header, not per-card
loadScripts(['lib/csi-ui.js'], sandbox);
assert(CSI.VERSION === '1.3.21', 'core version 1.3.21');
const adds = CSI.ui.WHAT_SAGE_ADDS;
const addsCopy = `${adds.summary} ${adds.detail}`;
assert(/chem badges/i.test(addsCopy) && /compare/i.test(addsCopy), 'chip mentions badges and compare');
assert(/cannabinoids/i.test(addsCopy) && /primary terps/i.test(addsCopy), 'chip prefers chem labels');
assert(!/\bstrain\b/i.test(addsCopy), 'chip does not frame by strain name');
assert(!/hover profile/i.test(addsCopy), 'chip does not call hover a product profile');
assert(/Pro tools/i.test(adds.detail), 'expand mentions Pro tools');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida|rise|iheartjane/i.test(addsCopy), 'no retailer brand in chip copy');
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
assert(!cardBadges.join('').includes('data-csi-partner'), 'partner chrome is not a per-card badge');

const partnerCommunity = CSI.ui.buildPartnerChip({
  status: 'community',
  displayName: 'Sunnyside'
});
assert(partnerCommunity.includes('data-csi-partner="1"'), 'partner chip marker');
assert(partnerCommunity.includes('Community adapter'), 'community label');
assert(partnerCommunity.includes('Sunnyside'), 'registry displayName in chip');
assert(!/Verified/.test(partnerCommunity), 'community is not verified');
const partnerVerified = CSI.ui.buildPartnerChip({
  status: 'verified',
  displayName: 'Partner Co'
});
assert(partnerVerified.includes('Verified') && partnerVerified.includes('Partner Co'), 'verified uses registry name');
assert(CSI.ui.buildPartnerChip({ status: 'community', displayName: '  ' }) === '', 'blank displayName — no chip');
assert(CSI.ui.buildPartnerChip({ status: 'denied', displayName: 'Nope' }) === '', 'denied status — no chip');
assert(CSI.ui.buildPartnerChip({ status: 'community' }) === '', 'missing displayName — no chip');
assert(CSI.ui.buildPartnerChip(null) === '', 'null chrome — no chip');

const listingSrc = fs.readFileSync(path.join(ext, 'content-listing.js'), 'utf8');
const pdpSrc = fs.readFileSync(path.join(ext, 'content-pdp.js'), 'utf8');
assert(listingSrc.includes('${CSI.ui.buildWhatSageAddsChip()}'), 'listing filter bar mounts chip');
assert(listingSrc.includes('CSI.partners?.mountChip?.(filterBar)'), 'listing mounts partner chip on filter bar');
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
  sharedPair.unique.some((u) => u.name === 'Beta-Myrcene' && u.label === 'Limonene 0.4% · Alpha'),
  'unique myrcene on first pick uses chem lead plus name'
);
assert(
  sharedPair.unique.some((u) => u.name === 'Alpha-Pinene' && u.label === 'Limonene 0.5% · Beta'),
  'unique pinene on second pick uses chem lead plus name'
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
assert(partial.unique.some((u) => u.name === 'Alpha-Pinene' && u.label === 'Limonene 1% · A'), 'pinene only on one uses chem lead plus name');

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
assert(mixed.unique.some((u) => u.name === 'Beta-Myrcene' && u.label === 'Limonene 1% · A'), 'unique among loaded picks uses chem lead plus name');
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

// Preference match on the floating PDP (v1.3.11) — same tasteMap gate, quiet when empty
const prefCopy = Object.values(CSI.ui.PREFERENCE_MATCH_COPY).join(' ');
assert(CSI.ui.PREFERENCE_MATCH_COPY.chip === 'Preference match', 'chip label');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida|savvy/i.test(prefCopy), 'no retailer brand in preference copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(prefCopy),
  'no medical or effects claims in preference copy'
);
const prefUi = uiSrc.slice(uiSrc.indexOf('const PREFERENCE_MATCH_COPY'), uiSrc.indexOf('function exportCompareJson'));
assert(prefUi.includes("can?.('tasteMap')"), 'preference panel uses the tasteMap gate');
assert(!/openUpgrade/.test(prefUi), 'preference panel has no upgrade control');
assert(prefUi.includes('function summarizePreferenceMatch'), 'quiet summary lives with the panel');

const seed = JSON.parse(fs.readFileSync(path.join(ext, 'data/default-taste-map.json'), 'utf8'));
assert(seed.preferredTerpenes && seed.preferredTerpenes.Limonene > 0, 'seed prefs include limonene');
assert(CSI.ui.summarizePreferenceMatch({ terpenes: { Limonene: 0.4 } }, { preferredTerpenes: {} }) === null, 'no prefs stays quiet');
assert(
  CSI.ui.summarizePreferenceMatch(
    { terpenes: { 'Total Terpenes': 2.4 } },
    { preferredTerpenes: { Limonene: 0.9 }, minMatchScore: 0 }
  ) === null,
  'total terpenes alone is not overlap'
);
assert(
  CSI.ui.summarizePreferenceMatch(
    { terpenes: { Limonene: 0.1 } },
    { preferredTerpenes: { Limonene: 1 }, minMatchScore: 0.9, preferHighTotalTerps: false }
  ) === null,
  'score under the saved minimum stays quiet'
);
const matched = CSI.ui.summarizePreferenceMatch(
  { terpenes: [{ name: 'Limonene', percentage: 0.55 }, { name: 'Myrcene', percentage: 0.2 }] },
  {
    preferredTerpenes: { Limonene: 0.95, 'Beta-Myrcene': 0.4, Linalool: 0.8 },
    avoidTerpenes: ['myrcene'],
    minMatchScore: 0.2,
    preferHighTotalTerps: false
  }
);
assert(matched && matched.overlaps[0].name === 'Limonene', 'overlap lists a preferred terpene that is present');
assert(matched.overlaps.some((row) => row.name === 'Beta-Myrcene'), 'myrcene alias counts as overlap');
assert(!matched.overlaps.some((row) => row.name === 'Linalool'), 'a preferred terpene that is absent is omitted');
assert(matched.avoid.some((row) => row.name === 'Beta-Myrcene'), 'avoid list only names a terpene that is listed');

sandbox.CSI.features = { can: () => false };
assert(CSI.ui.buildPreferenceMatchPanel({ terpenes: { Limonene: 0.55 } }, seed) === '', 'gate off renders nothing');
sandbox.CSI.features = { can: (id) => id === 'tasteMap' };
const prefHtml = CSI.ui.buildPreferenceMatchPanel(
  { terpenes: { Limonene: 0.55, Myrcene: 0.2 } },
  {
    preferredTerpenes: { Limonene: 0.95, Linalool: 0.2 },
    avoidTerpenes: ['Myrcene'],
    minMatchScore: 0.2,
    preferHighTotalTerps: false
  }
);
assert(prefHtml.includes('data-csi-pref-match="1"'), 'panel marker');
assert(prefHtml.includes('Preference match'), 'chip copy');
assert(prefHtml.includes('data-csi-terp="Limonene"'), 'overlapping terpene is tappable');
assert(prefHtml.includes('Also on your avoid list'), 'avoid line only when that terpene is listed');
assert(!/sunnyside|zenleaf|terravida|Upgrade/i.test(prefHtml), 'panel has no retailer name or upgrade control');
assert(
  CSI.ui.buildPreferenceMatchPanel({ terpenes: { Pinene: 0.2 } }, { preferredTerpenes: { Linalool: 1 }, minMatchScore: 0 }) === '',
  'no chem overlap renders nothing'
);
delete sandbox.CSI.features;

const prefAttach = pdpSrc.slice(pdpSrc.indexOf('async function attachPreferenceMatch'), pdpSrc.indexOf('async function attachDealVsMedian'));
assert(prefAttach.includes("can?.('tasteMap')"), 'pdp match uses tasteMap');
assert(prefAttach.includes('loadTasteMap'), 'pdp reads saved taste map');
assert(!/openUpgrade/.test(prefAttach), 'missing match does not nag to upgrade');
assert(pdpSrc.includes('buildPreferenceMatchPanel(product, product.tasteMap)'), 'floating panel mounts the match');
assert(!pdpSrc.includes('Map match ${'), 'pdp no longer uses the ungated percent badge');
assert(pdpSrc.includes('clearPdpBuyboxChemInject'), 'preference match stays out of the buy column');
const featuresSrcPref = fs.readFileSync(path.join(ext, 'lib/csi-features.js'), 'utf8');
const storageSrc = fs.readFileSync(path.join(ext, 'lib/csi-storage.js'), 'utf8');
assert(/tasteMap:\s*true/.test(featuresSrcPref), 'tasteMap stays the existing gate');
assert(!/preferenceMatch:/.test(featuresSrcPref), 'no second gate for the product-page match');

// Similar-by-chem same menu (v1.3.15) — cosine of listed chem, cached neighbors, Free
assert(CSI.SIMILAR_CHEM_MAX_NEIGHBORS === 3, 'at most three neighbors');
assert(CSI.SIMILAR_CHEM_MIN_SCORE === 0.4, 'cosine floor');
const similarCopy = Object.values(CSI.ui.SIMILAR_CHEM_COPY).join(' ');
assert(CSI.ui.SIMILAR_CHEM_COPY.title === 'Nearby chem on this menu', 'similar title');
assert(/cannabinoids and terpenes/.test(CSI.ui.SIMILAR_CHEM_COPY.lead), 'lead names listed chem');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida|savvy/i.test(similarCopy), 'no retailer brand in similar copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria|strain)\b/i.test(
    similarCopy
  ),
  'no medical, effects, or strain-name framing in similar copy'
);

const flowerA = {
  url: 'https://www.sunnyside.shop/product/a',
  name: 'Alpha Label',
  cannabinoids: { THC: 22 },
  terpenes: [
    { name: 'Limonene', percentage: 0.55 },
    { name: 'Myrcene', percentage: 0.2 }
  ]
};
const flowerB = {
  url: 'https://www.sunnyside.shop/product/b',
  name: 'Beta Label',
  cannabinoids: { THC: 21 },
  terpenes: { Limonene: 0.5, Myrcene: 0.18, Pinene: 0.05 }
};
const flowerFar = {
  url: 'https://www.sunnyside.shop/product/c',
  name: 'Far',
  cannabinoids: { THC: 8 },
  terpenes: { Linalool: 0.9 }
};
const otherHost = {
  url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-1/x',
  cannabinoids: { THC: 22 },
  terpenes: { Limonene: 0.55, Myrcene: 0.2 }
};
const rankedNear = CSI.rankSimilarByChem(flowerA, [flowerB, flowerFar, otherHost, flowerA], {
  host: 'www.sunnyside.shop',
  origin: 'https://www.sunnyside.shop'
});
assert(rankedNear.neighbors.length === 1, `one same-menu neighbor ${rankedNear.neighbors.length}`);
assert(rankedNear.neighbors[0].url.endsWith('/product/b'), 'closest chem wins');
assert(rankedNear.neighbors[0].sharedTerpenes.includes('Limonene'), 'shared named terp');
assert(rankedNear.neighbors[0].score >= CSI.SIMILAR_CHEM_MIN_SCORE, 'score at or above floor');
assert(!rankedNear.neighbors.some((n) => /zenleaf/i.test(n.url)), 'other host excluded');

const noShared = CSI.rankSimilarByChem(flowerA, [flowerFar], {
  host: 'www.sunnyside.shop'
});
assert(noShared.neighbors.length === 0, 'no shared named terp is not a neighbor');

const cannOnly = CSI.rankSimilarByChem(
  { url: 'https://www.sunnyside.shop/product/t1', cannabinoids: { THC: 20 } },
  [
    { url: 'https://www.sunnyside.shop/product/t2', cannabinoids: { THC: 21 } },
    { url: 'https://www.sunnyside.shop/product/t3', cannabinoids: { THC: 40 } }
  ],
  { host: 'www.sunnyside.shop' }
);
assert(cannOnly.neighbors.length === 1 && cannOnly.neighbors[0].url.endsWith('/t2'), 'THC-near cannabinoid-only neighbor');

const cannTotals = CSI.rankSimilarByChem(
  { url: 'https://www.sunnyside.shop/product/u1', terpenes: { 'Total Terpenes': 2.1 }, cannabinoids: { THC: 20 } },
  [{ url: 'https://www.sunnyside.shop/product/u2', terpenes: { 'Total Terpenes': 2.0 }, cannabinoids: { THC: 21 } }],
  { host: 'www.sunnyside.shop' }
);
assert(cannTotals.neighbors.length === 1, 'total-only terps fall back to THC nearness');

assert(
  CSI.readThcPercent({ THCA: 30, THC: 22, totalTHC: 26 }) === 30,
  'listing readThcPercent still prefers THCA'
);
assert(
  CSI.readListedThcPercent({ THCA: 30, THC: 22, totalTHC: 26 }) === 22,
  'similar-by-chem prefers listed THC over THCA'
);
const mixedVec = CSI.chemSimilarityVector({ cannabinoids: { THCA: 30, THC: 22 } });
assert(Math.abs(mixedVec.THC - 0.22) < 1e-9, 'vector uses listed THC when THCA is also present');
assert(
  Math.abs(CSI.chemSimilarityVector({ cannabinoids: { THCA: 30, totalTHC: 26 } }).THC - 0.26) < 1e-9,
  'vector uses totalTHC when THC is absent'
);
assert(
  Math.abs(CSI.chemSimilarityVector({ cannabinoids: { THCA: 30 } }).THC - 0.3) < 1e-9,
  'THCA-only menus still get a THC dimension'
);
const thcNotThca = CSI.rankSimilarByChem(
  { url: 'https://www.sunnyside.shop/product/m1', cannabinoids: { THC: 22, THCA: 8 } },
  [
    { url: 'https://www.sunnyside.shop/product/m2', cannabinoids: { THC: 21, THCA: 40 } },
    { url: 'https://www.sunnyside.shop/product/m3', cannabinoids: { THC: 8, THCA: 8 } }
  ],
  { host: 'www.sunnyside.shop' }
);
assert(
  thcNotThca.neighbors.length === 1 && thcNotThca.neighbors[0].url.endsWith('/m2'),
  'cannabinoid-only nearness uses listed THC, not THCA'
);

const invent = CSI.chemSimilarityVector({ cannabinoids: {}, terpenes: {} });
assert(Object.keys(invent).length === 0, 'missing chem is not a guessed vector');

assert(
  CSI.rankSimilarByChem({ status: 'empty', ...flowerA }, [flowerB]).neighbors.length === 0,
  'empty anchor has no neighbors'
);

sandbox.CSI.features = { can: () => false };
assert(CSI.ui.buildSimilarByChemPanel({ similarByChem: rankedNear }) === '', 'gate off renders nothing');
sandbox.CSI.features = { can: (id) => id === 'similarByChem' };
const similarHtml = CSI.ui.buildSimilarByChemPanel({ similarByChem: rankedNear });
assert(similarHtml.includes('data-csi-similar-chem="1"'), 'similar panel marker');
assert(similarHtml.includes('Nearby chem on this menu'), 'title copy');
assert(similarHtml.includes('Limonene'), 'chem label in row');
assert(similarHtml.includes('Beta Label'), 'name is secondary');
assert(similarHtml.indexOf('Limonene') < similarHtml.indexOf('Beta Label'), 'chem before name');
assert(!/Upgrade|openUpgrade/i.test(similarHtml), 'similar panel has no upgrade control');
assert(
  CSI.ui.buildSimilarByChemPanel({ similarByChem: { neighbors: [], note: CSI.ui.SIMILAR_CHEM_COPY.tooFew } }).includes(
    'csi-similar-chem-note'
  ),
  'too few is a calm note'
);
assert(CSI.ui.buildSimilarByChemPanel({ similarByChem: { neighbors: [] } }) === '', 'empty without note is omitted');
delete sandbox.CSI.features;

assert(/similarByChem:\s*true/.test(featuresSrcPref), 'similarByChem is free');
assert(!/const PRO_FEATURES = \{[^}]*similarByChem/s.test(featuresSrcPref), 'similarByChem is not Pro');
assert(gatesSrc.includes("'similarByChem'"), 'landing free gates list similarByChem');
assert(pdpSrc.includes('buildSimilarByChemPanel(product)'), 'floating panel mounts similar chem');
assert(pdpSrc.includes('attachSimilarByChem'), 'pdp attaches neighbors');
assert(pdpSrc.includes('listPdpCache'), 'pdp reads existing product cache');
const similarAttach = pdpSrc.slice(
  pdpSrc.indexOf('async function attachSimilarByChem'),
  pdpSrc.indexOf('async function attachCrossStoreSoftMatch')
);
assert(similarAttach.length > 0, 'attach exists');
assert(!/fetchProductDetails/.test(similarAttach), 'neighbors do not call fetchProductDetails');
assert(!/openUpgrade/.test(similarAttach), 'missing neighbors do not nag to upgrade');
assert(!/FETCH_PRODUCT_HTML|sendMessage/.test(similarAttach), 'neighbors do not fetch extra product HTML');
assert(listingSrc.includes('setPdpCache'), 'listing writes chem into the existing TTL cache');
assert(!listingSrc.includes('buildSimilarByChemPanel'), 'listing does not spam neighbor cards');
assert(storageSrc.includes('function listPdpCache'), 'storage lists cache by host');
assert(storageSrc.includes('CACHE_PREFIX'), 'neighbors reuse pdp cache keys');
const loadMediansSrc = storageSrc.slice(
  storageSrc.indexOf('async function loadCategoryMedians'),
  storageSrc.indexOf('async function saveCategoryMedians')
);
assert(/normalizeHostName\(snap\.host\)/.test(loadMediansSrc), 'category medians host is www-insensitive');
assert(storageSrc.includes('byHost'), 'category medians still migrate legacy byHost blobs');
assert(storageSrc.includes("KEYS.CATEGORY_MEDIANS + ':'"), 'category medians use a per-host storage key');
assert(storageSrc.includes('readMedianStore'), 'category medians migrate legacy flat snapshots');

// Chem-over-strain (v1.3.16) — Sage labels lead with listed chem; names stay secondary
assert(CSI.ui.STATUS_COPY.loading === 'Loading listed chemistry…', 'loading is chem, not profile');
assert(CSI.ui.STATUS_COPY.loadError === 'Could not load listed chemistry.', 'error is chem, not profile');
assert(CSI.ui.COMPARE_COPY.title === 'Chem comparison', 'compare title is chem-first');
assert(!/\bstrain\b/i.test(Object.values(CSI.ui.STATUS_COPY).join(' ')), 'status copy has no strain framing');
assert(!/\bstrain\b/i.test(Object.values(CSI.ui.COMPARE_COPY).join(' ')), 'compare copy has no strain framing');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(
    `${CSI.ui.STATUS_COPY.loading} ${CSI.ui.COMPARE_COPY.title}`
  ),
  'chem-over-strain copy has no medical or effects claims'
);
assert(CSI.ui.formatChemLead({}) === '', 'missing chem is omitted, not invented');
assert(CSI.ui.formatChemLead({ cannabinoids: { THC: 0 }, terpenes: { Limonene: 0 } }) === '', 'zero chem is omitted');
assert(
  CSI.ui.formatChemLead({
    name: 'Blue Dream',
    cannabinoids: { THC: 22 },
    terpenes: { Limonene: 0.55, Myrcene: 0.2 }
  }) === 'Limonene 0.55% · THC 22.0%',
  'chem lead is terp then THC'
);
assert(!/Blue Dream/.test(CSI.ui.formatChemLead({ name: 'Blue Dream', cannabinoids: { THC: 22 } })), 'lead excludes strain name');
const chemHeaderHtml = CSI.ui.buildChemOverStrainHeaderHtml({
  name: 'Beta Label',
  cannabinoids: { THC: 21 },
  terpenes: { Limonene: 0.5 }
});
assert(chemHeaderHtml.includes('csi-chem-lead') && chemHeaderHtml.includes('csi-chem-secondary'), 'header has chem then name');
assert(chemHeaderHtml.indexOf('Limonene') < chemHeaderHtml.indexOf('Beta Label'), 'compare header chem before name');
assert(CSI.ui.buildChemOverStrainHeaderHtml({ name: 'Only Name' }).includes('csi-chem-secondary'), 'name only is secondary');
assert(!CSI.ui.buildChemOverStrainHeaderHtml({ name: 'Only Name' }).includes('csi-chem-lead'), 'no invented chem lead');
assert(CSI.ui.buildTooltipContent({ status: 'loading' }).includes('Loading listed chemistry'), 'hover loading is listed chem');
assert(
  CSI.ui.formatChemLead({ cannabinoids: { THCA: 30 } }) === 'THCA 30.0%',
  'THCA-only lead is labeled THCA, not THC'
);
assert(
  CSI.ui.formatChemLead({ cannabinoids: { THC: 22, THCA: 30 } }) === 'THC 22.0%',
  'mixed listing prefers listed THC and does not rename THCA'
);
assert(
  CSI.ui.formatChemLead({ cannabinoids: { totalTHC: 26 } }) === 'Total THC 26.0%',
  'totalTHC-only lead keeps the total label'
);
assert(
  CSI.readListedThcDisplay({ THCA: 30, THC: 22 }).label === 'THC' &&
    CSI.readListedThcDisplay({ THCA: 30 }).label === 'THCA',
  'listed display labels match the published cannabinoid'
);
const thcaBadge = CSI.ui.buildListingBadgeChips({ product: { cannabinoids: { THCA: 28 } }, status: 'ok' }).join('');
assert(thcaBadge.includes('THCA 28.0%') && !thcaBadge.includes('THC 28.0%'), 'listing badge does not label THCA as THC');
const mixedBadge = CSI.ui.buildListingBadgeChips({
  product: { cannabinoids: { THC: 22, THCA: 30 } },
  status: 'ok'
}).join('');
assert(mixedBadge.includes('THC 22.0%') && !mixedBadge.includes('THCA 30'), 'listing badge uses listed THC when both exist');
assert(
  CSI.ui.buildTooltipContent({ status: 'error', error: 'Fetch failed' }).includes(
    'Could not load listed chemistry. Fetch failed'
  ),
  'hover error shows listed-chemistry status before the detail'
);
assert(
  CSI.ui.formatStatusError('Fetch failed') === 'Could not load listed chemistry. Fetch failed',
  'status error helper prefixes details'
);
assert(
  CSI.ui.formatStatusError(CSI.ui.STATUS_COPY.loadError) === CSI.ui.STATUS_COPY.loadError,
  'status error helper does not duplicate the status copy'
);
assert(pdpSrc.includes('CSI.ui.formatStatusError(product.error)'), 'PDP error uses shared status-then-detail copy');
assert(pdpSrc.includes('CSI.ui.STATUS_COPY.loading'), 'PDP loading uses shared chem status copy');
const cssSrc = fs.readFileSync(path.join(ext, 'content.css'), 'utf8');
assert(
  /#cannabis-sage-comparison-sidebar th \.csi-chem-secondary[\s\S]*?color:\s*rgba\(255,\s*255,\s*255/.test(cssSrc),
  'compare header secondary name contrasts on orange'
);
const landingSrc = fs.readFileSync(path.join(root, 'web/app/page.tsx'), 'utf8');
assert(
  landingSrc.includes('floating chemistry panel') && !landingSrc.includes('inline chemistry panel'),
  'landing PDP screenshot alt matches floating caption'
);
assert(landingSrc.includes('id="roadmap"'), 'landing has a Roadmap section');
assert(
  landingSrc.includes(
    'Listed cannabinoids and primary terpenes on supported menus, side-by-side'
  ) &&
    landingSrc.includes('close matches at your other supported') &&
    landingSrc.includes('optional on-device taste profile') &&
    landingSrc.includes('Pro picks across nearby'),
  'landing Roadmap Now copy includes cross-store match, local profile, and Pro picks'
);
assert(
  landingSrc.includes('Restock and deal alerts') &&
    !landingSrc.includes('Picks that match that profile across nearby supported menus, and restock'),
  'landing Roadmap Next copy is restock/deal alerts after picks shipped'
);
assert(
  landingSrc.includes('Ask Sage, a chat guide that') &&
    landingSrc.includes('explains listed chemistry in plain words'),
  'landing Roadmap Later copy'
);
assert(
  landingSrc.includes("Plans can change. We ship each piece when it&apos;s solid."),
  'landing Roadmap footer copy'
);
assert(!/AI budtender|Taylor/i.test(landingSrc), 'landing does not name an AI budtender or Taylor');
assert(
  !landingSrc.includes('docs/ROADMAP.md') && !landingSrc.includes('Full roadmap'),
  'landing does not link to docs/ROADMAP.md or say Full roadmap'
);
const roadmapSrc = fs.readFileSync(path.join(root, 'docs/ROADMAP.md'), 'utf8');
const roadmapForbidden = [
  'Stripe',
  'acct_',
  'StrainChain',
  'Taylor',
  'Assay',
  'Cheech',
  'Web3',
  'Avalanche',
  'Blockticity',
  'Sunnyside',
  'Zen Leaf',
  'TerraVida'
];
for (const needle of roadmapForbidden) {
  assert(
    !new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(roadmapSrc),
    `docs/ROADMAP.md must not contain ${needle}`
  );
}
const sameChemUnique = CSI.ui.summarizeTerpeneOverlap([
  { name: 'Alpha', status: 'ok', cannabinoids: { THC: 22 }, terpenes: { Limonene: 0.5, Myrcene: 0.2 } },
  { name: 'Beta', status: 'ok', cannabinoids: { THC: 22 }, terpenes: { Limonene: 0.5, Pinene: 0.1 } }
]);
assert(
  sameChemUnique.unique.some((u) => u.name === 'Beta-Myrcene' && u.label === 'Limonene 0.5% · THC 22.0% · Alpha') &&
    sameChemUnique.unique.some((u) => u.name === 'Alpha-Pinene' && u.label === 'Limonene 0.5% · THC 22.0% · Beta'),
  'matching chem leads stay tied to a named pick'
);
const twinNameUnique = CSI.ui.summarizeTerpeneOverlap([
  { name: 'House', status: 'ok', cannabinoids: { THC: 22 }, terpenes: { Limonene: 0.5, Myrcene: 0.2 } },
  { name: 'House', status: 'ok', cannabinoids: { THC: 22 }, terpenes: { Limonene: 0.5, Pinene: 0.1 } }
]);
assert(
  twinNameUnique.unique.some((u) => u.name === 'Beta-Myrcene' && /Pick 1/.test(u.label)) &&
    twinNameUnique.unique.some((u) => u.name === 'Alpha-Pinene' && /Pick 2/.test(u.label)),
  'identical name plus chem still gets a distinct pick number'
);
assert(uiSrc.includes('fillChemOverStrainHeader(th, p)'), 'compare columns use chem-over-strain headers');
assert(!uiSrc.includes('Product Comparison'), 'compare sidebar dropped product-title framing');
assert(!/\bstrain\b/i.test(CSI.ui.PREFERENCE_MATCH_COPY.lead), 'preference lead is not strain-framed');
assert(/listed chem/.test(CSI.ui.PREFERENCE_MATCH_COPY.lead), 'preference lead names listed chem');

// Soft Pro unlock mid-browse (v1.3.12) — after chem is visible, not a wall
const softCopy = Object.values(CSI.ui.SOFT_UNLOCK_COPY).join(' ');
assert(CSI.ui.SOFT_UNLOCK_MIN_CARDS === 3, 'soft unlock waits for three cards');
assert(
  /taste-map match/.test(CSI.ui.SOFT_UNLOCK_COPY.line) && /\$\/mg/.test(CSI.ui.SOFT_UNLOCK_COPY.line),
  'line names match and $/mg'
);
assert(/Chemistry and compare stay/.test(CSI.ui.SOFT_UNLOCK_COPY.line), 'line keeps chem and compare');
assert(CSI.ui.SOFT_UNLOCK_COPY.upgrade === 'Upgrade', 'reuses Upgrade label');
assert(!/sunnyside|zen\s*leaf|zenleaf|terravida/i.test(softCopy), 'no retailer brand in soft unlock copy');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria)\b/i.test(softCopy),
  'no medical or effects claims in soft unlock copy'
);
const readyOffer = {
  hasPro: false,
  storeAllowed: true,
  enrichedCount: 3,
  engaged: true,
  dismissed: false
};
assert(CSI.ui.shouldOfferSoftUnlock(readyOffer) === true, 'offers after browse and three cards');
assert(CSI.ui.shouldOfferSoftUnlock({ ...readyOffer, engaged: false }) === false, 'quiet before scroll or hover');
assert(
  CSI.ui.shouldOfferSoftUnlock({ ...readyOffer, enrichedCount: 2 }) === false,
  'quiet before three chem-ready cards'
);
assert(CSI.ui.shouldOfferSoftUnlock({ ...readyOffer, hasPro: true }) === false, 'pro does not see the prompt');
assert(
  CSI.ui.shouldOfferSoftUnlock({ ...readyOffer, storeAllowed: false }) === false,
  'multi-store gate does not add the prompt'
);
assert(CSI.ui.shouldOfferSoftUnlock({ ...readyOffer, dismissed: true }) === false, 'dismiss stays quiet');
const softHtml = CSI.ui.buildSoftUnlockPrompt();
assert(softHtml.includes('data-csi-soft-unlock="1"'), 'prompt marker');
assert(softHtml.includes('data-csi-soft-unlock-upgrade="1"'), 'upgrade control');
assert(softHtml.includes('data-csi-soft-unlock-dismiss="1"'), 'dismiss control');
assert(softHtml.includes('role="note"'), 'prompt is a note');
assert(!/role="dialog"|aria-modal/i.test(softHtml), 'prompt is not a modal wall');
assert(!/sunnyside|zenleaf|terravida/i.test(softHtml), 'prompt html has no retailer name');

const softSrc = listingSrc.slice(
  listingSrc.indexOf('function countChemReadyCards'),
  listingSrc.indexOf('async function startListing')
);
assert(softSrc.includes('shouldOfferSoftUnlock'), 'listing asks before showing');
assert(softSrc.includes('openUpgrade'), 'upgrade uses the existing deep link');
assert(softSrc.includes('saveSoftUnlockDismissed'), 'dismiss is remembered');
assert(!softSrc.includes('csi-filtered-out'), 'prompt does not hide cards');
assert(!/stripe\.elements|PaymentElement|cardNumber/i.test(softSrc), 'no card collection in the prompt');
const enrichSrc = listingSrc.slice(
  listingSrc.indexOf('async function enrichCard'),
  listingSrc.indexOf('function cardCategoryKey')
);
assert(!/openUpgrade|buildSoftUnlockPrompt|csi-soft-unlock/.test(enrichSrc), 'chem enrich is not an upgrade wall');
assert(!pdpSrc.includes('buildSoftUnlockPrompt'), 'product page does not mount the mid-browse prompt');
const gateAt = listingSrc.indexOf('if (!CSI.features?.canUseActiveStore');
const gateBlock = listingSrc.slice(gateAt, gateAt + 160);
assert(gateBlock.includes('showStoreGateBanner();') && gateBlock.includes('return;'), 'store gate still returns early');
assert(!gateBlock.includes('soft-unlock') && !gateBlock.includes('maybeOfferSoftUnlock'), 'store gate does not mount the soft prompt');
assert(
  listingSrc.indexOf('showStoreGateBanner();') < listingSrc.indexOf("addEventListener('scroll', onSoftUnlockScroll"),
  'soft unlock is armed only after the store gate'
);
assert(/hoverTooltip:\s*true/.test(featuresSrcPref), 'hover stays free');
assert(/compareTray:\s*true/.test(featuresSrcPref), 'compare stays free');
assert(/pdpPanel:\s*true/.test(featuresSrcPref), 'product panel stays free');
assert(/basicBadges:\s*true/.test(featuresSrcPref), 'chem badges stay free');
assert(storageSrc.includes("SOFT_UNLOCK_DISMISS: 'csi_soft_unlock_dismissed'"), 'dismiss key');
assert(storageSrc.includes('function loadSoftUnlockDismissed'), 'dismiss load');
assert(storageSrc.includes('function saveSoftUnlockDismissed'), 'dismiss save');
assert(listingSrc.includes("addEventListener('scroll', onSoftUnlockScroll"), 'scroll can count as mid-browse');
assert(listingSrc.includes('noteBrowseEngagement();'), 'hover counts as mid-browse');
const configSoft = JSON.parse(fs.readFileSync(path.join(ext, 'data/config.json'), 'utf8'));
assert(configSoft.upgradeUrl === 'https://cannabissage.app/#pricing', 'upgrade still opens site checkout');

// Cross-store soft match (v1.3.17) + store switcher (v1.3.18) — other adapters, cached only, multiStore Pro
assert(CSI.CROSS_STORE_MAX_MATCHES === 3, 'at most three other-store rows');
assert(CSI.CROSS_STORE_MIN_SCORE === 0.38, 'soft-match floor');
const crossCopy = Object.values(CSI.ui.CROSS_STORE_COPY).join(' ');
assert(CSI.ui.CROSS_STORE_COPY.title === 'At other stores you shop', 'cross-store title');
assert(/already opened|already shop/.test(crossCopy), 'cache-only framing');
assert(/Open a match to jump stores|Open on|Cached stores for this item/.test(crossCopy), 'switcher framing in copy');
assert(!/switcher/i.test(CSI.ui.CROSS_STORE_COPY.tooFew), 'empty state is not a switcher');
assert(
  !/\b(medical|effects?|cure|cures|treat|treats|treatment|relief|pain|anxiety|euphoria|strain)\b/i.test(
    crossCopy
  ),
  'no medical, effects, or strain-name framing in cross-store copy'
);
const hostPerms = JSON.stringify(manifest.host_permissions);
assert(
  hostPerms ===
    JSON.stringify([
      'https://www.sunnyside.shop/*',
      'https://sunnyside.shop/*',
      'https://zenleafdispensaries.com/*',
      'https://www.zenleafdispensaries.com/*',
      'https://risecannabis.com/*',
      'https://www.risecannabis.com/*',
      'https://cannabissage.app/*',
      'https://cannabissage.vercel.app/*',
      'http://localhost:3000/*',
      'https://localhost:3000/*'
    ]),
  'host permissions include RISE + prior retailers'
);
assert(
  manifest.content_scripts?.[1]?.js?.includes('adapters/iheartjane.js'),
  'iheartjane content script listed'
);
assert(
  manifest.content_scripts?.[0]?.matches?.some((m) => /risecannabis\.com\/dispensaries\//.test(m)),
  'bridge matches RISE dispensaries'
);
assert(
  manifest.web_accessible_resources?.[0]?.matches?.includes('https://risecannabis.com/*'),
  'WAR matches RISE'
);

const zlFlower = {
  url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/blue-dream-1',
  name: 'Blue Dream 3.5g Flower',
  adapterId: 'zenleaf',
  categoryKey: 'flower',
  weightText: '3.5g',
  price: 42,
  cannabinoids: { THC: 22 },
  terpenes: { Limonene: 0.55, Myrcene: 0.2 }
};
const syNear = {
  url: 'https://www.sunnyside.shop/product/blue-dream',
  name: 'Blue Dream',
  adapterId: 'sunnyside',
  categoryKey: 'flower',
  weightText: '3.5 g',
  price: 40,
  cannabinoids: { THC: 21.5 },
  terpenes: { Limonene: 0.5, Myrcene: 0.18 }
};
const syFar = {
  url: 'https://www.sunnyside.shop/product/linalool-only',
  name: 'Night Cap',
  adapterId: 'sunnyside',
  categoryKey: 'flower',
  weightText: '3.5g',
  price: 50,
  cannabinoids: { THC: 8 },
  terpenes: { Linalool: 0.9 }
};
const tvMalvern = {
  url: 'https://zenleafdispensaries.com/locations/malvern/medical-menu/menu/flower-709/blue-dream-9',
  name: 'Blue Dream',
  adapterId: 'terravida',
  categoryKey: 'flower',
  weightText: '3.5g',
  price: 38,
  cannabinoids: { THC: 22 },
  terpenes: { Limonene: 0.55, Myrcene: 0.2 }
};
const sameStore = {
  url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/other',
  name: 'Blue Dream',
  adapterId: 'zenleaf',
  categoryKey: 'flower',
  cannabinoids: { THC: 22 },
  terpenes: { Limonene: 0.55, Myrcene: 0.2 }
};

assert(CSI.normalizeProductName('Blue Dream 3.5g Flower') === 'blue dream', 'name drops size and form');
assert(CSI.nameSimilarity('Blue Dream 3.5g', 'Blue Dream') === 1, 'same listed name after normalize');
assert(CSI.adapterIdFromUrl(tvMalvern.url) === 'terravida', 'malvern url is terravida');
assert(CSI.adapterIdFromUrl(zlFlower.url) === 'zenleaf', 'abington url is zenleaf');
assert(CSI.adapterIdFromUrl(syNear.url) === 'sunnyside', 'sunnyside url');

const rankedCross = CSI.rankCrossStoreSoftMatch(zlFlower, [syNear, syFar, tvMalvern, sameStore, zlFlower], {
  excludeAdapterId: 'zenleaf'
});
assert(rankedCross.matches.length >= 1, 'other-store matches exist');
assert(
  rankedCross.matches.every((m) => m.adapterId !== 'zenleaf'),
  'same adapter excluded'
);
assert(
  rankedCross.matches.some((m) => m.adapterId === 'sunnyside' && /sunnyside/i.test(m.url)),
  'sunnyside neighbor included'
);
assert(
  rankedCross.matches.some((m) => m.adapterId === 'terravida'),
  'terra vida malvern is another store on the same host'
);
assert(!rankedCross.matches.some((m) => m.url === syFar.url), 'far chem is not a match');
assert(rankedCross.matches[0].reason, 'each match has a reason');
assert(!/identical/i.test(rankedCross.matches[0].reason) || rankedCross.matches[0].identical, 'identical only when flagged');
assert(rankedCross.matches[0].price != null, 'cached price carried');
assert(rankedCross.matches[0].dollarsPerMg > 0, '$/mg from cached price and weight');

const identicalPair = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-a',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    weightText: '3.5g',
    cannabinoids: { THC: 22, THCA: 8 },
    terpenes: { Limonene: 0.5, Myrcene: 0.2 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend',
      name: 'House Blend 3.5g Flower',
      adapterId: 'zenleaf',
      categoryKey: 'flower',
      weightText: '3.5g',
      price: 41,
      cannabinoids: { THC: 22, THCA: 8 },
      terpenes: { Limonene: 0.5, Myrcene: 0.2 }
    }
  ]
);
assert(identicalPair.matches.length === 1, 'identical candidate kept');
assert(identicalPair.matches[0].identical === true, 'same name size and chem is identical');
assert(/same listed/i.test(identicalPair.matches[0].reason), 'identical reason is explicit');

const thcaMismatch = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-a-thca',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    weightText: '3.5g',
    cannabinoids: { THC: 22, THCA: 8 },
    terpenes: { Limonene: 0.5, Myrcene: 0.2 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend-thca',
      name: 'House Blend 3.5g Flower',
      adapterId: 'zenleaf',
      categoryKey: 'flower',
      weightText: '3.5g',
      price: 41,
      cannabinoids: { THC: 22, THCA: 40 },
      terpenes: { Limonene: 0.5, Myrcene: 0.2 }
    }
  ]
);
assert(thcaMismatch.matches.length === 1, 'THCA-mismatch candidate still ranks as near match');
assert(thcaMismatch.matches[0].identical !== true, 'THCA mismatch is not identical');
assert(!/same listed/i.test(thcaMismatch.matches[0].reason), 'THCA mismatch keeps near-match reason');

const zeroVsPositiveCbn = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-a-cbn0',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    weightText: '3.5g',
    cannabinoids: { THC: 22, THCA: 8, CBN: 0 },
    terpenes: { Limonene: 0.5, Myrcene: 0.2 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend-cbn5',
      name: 'House Blend 3.5g Flower',
      adapterId: 'zenleaf',
      categoryKey: 'flower',
      weightText: '3.5g',
      price: 41,
      cannabinoids: { THC: 22, THCA: 8, CBN: 5 },
      terpenes: { Limonene: 0.5, Myrcene: 0.2 }
    }
  ]
);
assert(zeroVsPositiveCbn.matches.length === 1, 'CBN 0 vs 5 still ranks as near match');
assert(zeroVsPositiveCbn.matches[0].identical !== true, 'CBN 0 vs positive is not identical');
assert(!/same listed/i.test(zeroVsPositiveCbn.matches[0].reason), 'CBN 0 vs positive keeps near-match reason');
assert(
  CSI.listedCannabinoidsAgree({ THC: 22, CBN: 0 }, { THC: 22, CBN: 5 }) === false,
  'shared CBN 0 vs 5 fails listedCannabinoidsAgree'
);

const absentCbnNotDisqualifying = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-a-nocbn',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    weightText: '3.5g',
    cannabinoids: { THC: 22, THCA: 8 },
    terpenes: { Limonene: 0.5, Myrcene: 0.2 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend-with-cbn',
      name: 'House Blend 3.5g Flower',
      adapterId: 'zenleaf',
      categoryKey: 'flower',
      weightText: '3.5g',
      price: 41,
      cannabinoids: { THC: 22, THCA: 8, CBN: 5 },
      terpenes: { Limonene: 0.5, Myrcene: 0.2 }
    }
  ]
);
assert(absentCbnNotDisqualifying.matches.length === 1, 'absent CBN candidate still ranks');
assert(
  absentCbnNotDisqualifying.matches[0].identical === true,
  'CBN present on only one side does not block identical'
);
assert(
  CSI.listedCannabinoidsAgree({ THC: 22, THCA: 8 }, { THC: 22, THCA: 8, CBN: 5 }) === true,
  'one-sided CBN is ignored by listedCannabinoidsAgree'
);
assert(
  CSI.listedCannabinoidsAgree({ THC: 22, CBN: 0 }, { THC: 22, CBN: 0 }) === true,
  'shared CBN 0 vs 0 still agrees'
);
assert(
  CSI.listedCannabinoidsAgree({ THC: 22, CBN: null }, { THC: 22, CBN: 5 }) === true,
  'null CBN is not treated as listed 0'
);

const unknownSizePair = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-a-nosize',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    cannabinoids: { THC: 22, THCA: 8 },
    terpenes: { Limonene: 0.5, Myrcene: 0.2 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend-nosize',
      name: 'House Blend Flower',
      adapterId: 'zenleaf',
      categoryKey: 'flower',
      price: 41,
      cannabinoids: { THC: 22, THCA: 8 },
      terpenes: { Limonene: 0.5, Myrcene: 0.2 }
    }
  ]
);
assert(
  unknownSizePair.matches.length === 0 || unknownSizePair.matches[0].identical !== true,
  'unknown package size is not identical'
);

const nameOnlyFarChem = CSI.rankCrossStoreSoftMatch(
  {
    url: 'https://www.sunnyside.shop/product/id-b',
    name: 'House Blend',
    adapterId: 'sunnyside',
    categoryKey: 'flower',
    cannabinoids: { THC: 22 },
    terpenes: { Limonene: 0.5 }
  },
  [
    {
      url: 'https://zenleafdispensaries.com/locations/abington/medical-menu/menu/flower-709/house-blend-far',
      name: 'House Blend',
      adapterId: 'zenleaf',
      categoryKey: 'edibles',
      cannabinoids: { THC: 5 },
      terpenes: { Linalool: 1.2 }
    }
  ]
);
assert(
  nameOnlyFarChem.matches.length === 0 || nameOnlyFarChem.matches[0].identical !== true,
  'divergent chem is not claimed identical'
);

const noOther = CSI.rankCrossStoreSoftMatch(zlFlower, [sameStore], { excludeAdapterId: 'zenleaf' });
assert(noOther.matches.length === 0, 'only same-store cache is empty for cross-store');

const thcaLead = CSI.ui.formatChemLead({ cannabinoids: { THCA: 30 } });
assert(thcaLead === 'THCA 30.0%', 'cross-store chem lead still labels THCA');

sandbox.CSI.features = { can: () => false };
assert(
  CSI.ui.buildCrossStoreMatchPanel({ crossStoreMatch: rankedCross }).includes('data-csi-cross-store-locked'),
  'multiStore off is a soft lock'
);
assert(
  CSI.ui.buildCrossStoreMatchPanel({ crossStoreMatch: rankedCross }).includes('Upgrade'),
  'locked panel reuses Upgrade'
);
const freeCrossHtml = CSI.ui.buildCrossStoreMatchPanel({ crossStoreMatch: rankedCross });
assert(!freeCrossHtml.includes('data-csi-store-switcher'), 'switcher hidden for free');
assert(!freeCrossHtml.includes('data-csi-cross-store-open'), 'Open-on links hidden for free');
sandbox.CSI.features = { can: (id) => id === 'multiStore' };
const crossHtml = CSI.ui.buildCrossStoreMatchPanel({ crossStoreMatch: rankedCross });
assert(crossHtml.includes('data-csi-cross-store="1"'), 'cross-store panel marker');
assert(crossHtml.includes('At other stores you shop'), 'title copy');
assert(/Limonene|THC/.test(crossHtml), 'chem lead in row');
assert(crossHtml.includes('csi-chem-secondary'), 'name and store are secondary');
assert(crossHtml.includes('data-csi-cross-store-open'), 'Open-on jump link for Pro');
assert(crossHtml.includes('target="_blank"'), 'Open-on uses new tab');
assert(crossHtml.includes('rel="noopener noreferrer"'), 'Open-on is noopener');
assert(
  rankedCross.matches.filter((m) => CSI.ui.crossStoreHref(m.url)).length >= 2
    ? crossHtml.includes('data-csi-store-switcher="1"')
    : !crossHtml.includes('data-csi-store-switcher'),
  'switcher strip when ≥2 allowlisted destinations'
);
assert(!/cardNumber|PaymentElement|stripe\.elements/i.test(crossHtml), 'no card collection');
assert(
  CSI.ui.buildCrossStoreMatchPanel({
    crossStoreMatch: { matches: [], note: CSI.ui.CROSS_STORE_COPY.tooFew }
  }).includes('csi-cross-store-note'),
  'too few is a calm note'
);
assert(CSI.ui.buildCrossStoreMatchPanel({ crossStoreMatch: { matches: [] } }) === '', 'empty without note is omitted');
assert(
  CSI.ui.buildCrossStoreMatchPanel({
    crossStoreMatch: {
      matches: [
        {
          url: 'https://evil.example/p',
          name: 'Nope',
          cannabinoids: { THC: 22 },
          storeLabel: 'Sunnyside',
          reason: 'Close listed chem.',
          identical: false
        }
      ]
    }
  }).includes('<span class="csi-cross-store-line'),
  'unsupported host is not a link'
);
assert(
  !CSI.ui
    .buildCrossStoreMatchPanel({
      crossStoreMatch: {
        matches: [
          {
            url: 'https://evil.example/p',
            name: 'Nope',
            cannabinoids: { THC: 22 },
            storeLabel: 'Sunnyside',
            adapterId: 'sunnyside',
            reason: 'Close listed chem.',
            identical: false
          }
        ]
      }
    })
    .includes('data-csi-cross-store-open'),
  'unsupported host has no Open-on link'
);
assert(CSI.ui.crossStoreHref('https://evil.example/p') === '', 'crossStoreHref drops unknown host');
assert(CSI.ui.crossStoreHref('javascript:alert(1)') === '', 'crossStoreHref drops non-http(s)');
assert(
  CSI.ui.crossStoreHref('https://www.sunnyside.shop/product/blue-dream').includes('sunnyside.shop'),
  'crossStoreHref keeps built-in adapter URL'
);
assert(
  CSI.ui.listCrossStoreDestinations([
    { url: 'https://evil.example/p', adapterId: 'evil', storeLabel: 'Evil' },
    { url: 'ftp://www.sunnyside.shop/product/x', adapterId: 'sunnyside', storeLabel: 'Sunnyside' }
  ]).length === 0,
  'destinations drop non-allowlisted URLs'
);

const singleStoreHtml = CSI.ui.buildCrossStoreMatchPanel({
  crossStoreMatch: {
    matches: [
      {
        url: syNear.url,
        name: syNear.name,
        cannabinoids: syNear.cannabinoids,
        terpenes: syNear.terpenes,
        storeLabel: 'Sunnyside',
        adapterId: 'sunnyside',
        reason: 'Close listed chem.',
        identical: false,
        price: 40
      }
    ]
  }
});
assert(singleStoreHtml.includes('data-csi-cross-store-open'), 'single other store still has Open-on');
assert(!singleStoreHtml.includes('data-csi-store-switcher'), 'switcher hidden when only one store has cache');
assert(CSI.ui.buildCrossStoreSwitcher(CSI.ui.listCrossStoreDestinations([{ url: syNear.url, adapterId: 'sunnyside', storeLabel: 'Sunnyside' }])) === '', 'switcher builder empty for one destination');

const twoDestHtml = CSI.ui.buildCrossStoreMatchPanel({
  crossStoreMatch: {
    matches: [
      {
        url: syNear.url,
        name: syNear.name,
        cannabinoids: syNear.cannabinoids,
        storeLabel: 'Sunnyside',
        adapterId: 'sunnyside',
        reason: 'Close listed chem.',
        identical: false
      },
      {
        url: tvMalvern.url,
        name: tvMalvern.name,
        cannabinoids: tvMalvern.cannabinoids,
        storeLabel: 'TerraVida (Zen Leaf Malvern)',
        adapterId: 'terravida',
        reason: 'Close listed chem.',
        identical: false
      }
    ]
  }
});
assert(twoDestHtml.includes('data-csi-store-switcher="1"'), 'switcher shown for two cached stores');
assert(twoDestHtml.includes('Cached stores for this item'), 'switcher lead copy');
assert((twoDestHtml.match(/data-csi-store-switcher-chip=/g) || []).length >= 2, 'one chip per store');

delete sandbox.CSI.features;

assert(/multiStore:\s*true/.test(featuresSrcPref), 'cross-store reuses multiStore');
assert(!/crossStore/.test(featuresSrcPref), 'no second gate id');
assert(pdpSrc.includes('buildCrossStoreMatchPanel(product)'), 'floating panel mounts cross-store');
assert(pdpSrc.includes('attachCrossStoreSoftMatch'), 'pdp attaches other-store matches');
assert(pdpSrc.includes("listPdpCache?.({ excludeAdapterId"), 'pdp lists cache excluding this adapter');
assert(pdpSrc.includes("can?.('multiStore')"), 'pdp uses existing multiStore gate');
assert(pdpSrc.includes('data-csi-cross-store-upgrade') && pdpSrc.includes('openUpgrade'), 'locked Upgrade uses site checkout');
const crossAttach = pdpSrc.slice(
  pdpSrc.indexOf('async function attachCrossStoreSoftMatch'),
  pdpSrc.indexOf('function clearPdpBuyboxChemInject')
);
assert(crossAttach.length > 0, 'cross-store attach exists');
assert(!/fetchProductDetails/.test(crossAttach), 'other-store rows do not call fetchProductDetails');
assert(!/FETCH_PRODUCT_HTML|sendMessage/.test(crossAttach), 'other-store rows do not fetch extra HTML');
assert(!/fetch\(|XMLHttpRequest|chrome\.runtime\.sendMessage/.test(uiSrc.match(/function buildCrossStoreMatchPanel[\s\S]*?function buildPreferenceMatchPanel/)?.[0] || ''), 'switcher UI does not fetch');
assert(listingSrc.includes('buildPdpCacheRecord') && listingSrc.includes('merge: true'), 'listing merges price/size into TTL cache');
assert(!listingSrc.includes('buildCrossStoreMatchPanel'), 'listing does not spam other-store cards');
assert(storageSrc.includes('excludeAdapterId'), 'storage can list cache minus this adapter');
assert(storageSrc.includes('opts.merge') || storageSrc.includes('opts && opts.merge'), 'cache merge keeps TTL');
assert(!/new Function|eval\(/.test(pdpSrc + listingSrc), 'no eval loaders on listing/pdp');

// Local taste profile (v1.3.19) — Free, opt-in, chrome.storage.local only
assert(fs.existsSync(path.join(ext, 'lib/csi-profile.js')), 'csi-profile.js present');
assert(manifest.content_scripts?.[1]?.js?.includes('lib/csi-profile.js'), 'profile in content scripts');
assert(storageSrc.includes("PROFILE: 'csi_taste_profile'"), 'profile storage key');
assert(storageSrc.includes('loadTasteProfile') && storageSrc.includes('deleteTasteProfile'), 'profile load/delete');
assert(listingSrc.includes('setBoughtBeforeFlag') && pdpSrc.includes('setBoughtBeforeFlag'), 'bought-before flags on listing and PDP');
assert(pdpSrc.includes('buildBoughtBeforePanel'), 'PDP mounts bought-before');
assert(featuresSrcPref.includes('tasteProfile: true'), 'tasteProfile is Free');
assert(/tasteMap:\s*true/.test(featuresSrcPref), 'taste-map remains Pro');
assert(pdpSrc.includes('applyToTasteMap'), 'enabled profile can feed Pro taste-map scoring');
assert(!/chrome\.storage\.sync/.test(storageSrc), 'profile uses local storage only');
assert(!/p\.tasteProfile\s*=/.test(listingSrc) && !/product\.tasteProfile\s*=/.test(listingSrc), 'listing does not copy profile onto cards');
assert(!/product\.tasteProfile/.test(pdpSrc), 'pdp keeps profile in content-script state');
const fetchSrcPref = fs.readFileSync(path.join(ext, 'lib/csi-fetch.js'), 'utf8');
assert(fetchSrcPref.includes('delete out.tasteProfile') && fetchSrcPref.includes('delete out.tasteMap'), 'host product cache strips prefs');
assert(fetchSrcPref.includes('omitSensitivePrefs'), 'host cache sanitizes data-csi-product-data');

// Picks for you (v1.3.20) — Pro, popup-only, cached menus
assert(fs.existsSync(path.join(ext, 'lib/csi-picks.js')), 'csi-picks.js present');
assert(featuresSrcPref.includes('picksForYou: true'), 'picksForYou is Pro');
assert(!manifest.content_scripts?.[1]?.js?.includes('lib/csi-picks.js'), 'picks not in content scripts');
assert(fs.readFileSync(path.join(ext, 'lib/csi-core.js'), 'utf8').includes("onSale: !!product.onSale") || fs.readFileSync(path.join(ext, 'lib/csi-core.js'), 'utf8').includes('rec.onSale'), 'cache record can keep onSale');

console.log('smoke-adapters: OK');

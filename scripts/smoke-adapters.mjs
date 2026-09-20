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
assert(manifest.version === '1.3.4', 'version bump');

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

console.log('smoke-adapters: OK');

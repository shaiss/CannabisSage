#!/usr/bin/env node
/**
 * License handoff smoke: openManage must not put the key in a query string.
 * Fragment (#key=…) is OK; the account page clears it client-side.
 * Run: node scripts/smoke-license-handoff.mjs
 * (Node 20+ — transpiles web/lib/license-handoff.ts via typescript; no strip-types)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extension');
const web = path.join(root, 'web');

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const entitlementSrc = fs.readFileSync(path.join(ext, 'lib/csi-entitlement.js'), 'utf8');
assert(!/\?key=/.test(entitlementSrc), 'csi-entitlement.js must not build ?key= URLs');
assert(!/&key=/.test(entitlementSrc), 'csi-entitlement.js must not build &key= URLs');
assert(
  /#key=\$\{encodeURIComponent\(rec\.licenseKey\)\}/.test(entitlementSrc) ||
    /accountUrl\}#key=/.test(entitlementSrc),
  'openManage must hand the key in the URL fragment (#key=…)'
);
assert(/openManage/.test(entitlementSrc), 'openManage present');

const accountSrc = fs.readFileSync(path.join(web, 'app/account/page.tsx'), 'utf8');
assert(
  /from ['"]@\/lib\/license-handoff['"]/.test(accountSrc),
  'account page imports takeLicenseKeyFromUrl from @/lib/license-handoff'
);
assert(/takeLicenseKeyFromUrl\s*\(/.test(accountSrc), 'account page calls takeLicenseKeyFromUrl');
assert(
  /method:\s*['"]POST['"]/.test(accountSrc) && /\/api\/license\/validate/.test(accountSrc),
  'account page validates via POST body, not a query string'
);

const handoffTsPath = path.join(web, 'lib/license-handoff.ts');
const handoffSrc = fs.readFileSync(handoffTsPath, 'utf8');
assert(/loc\.hash/.test(handoffSrc), 'handoff helper reads hash');
assert(/replaceState/.test(handoffSrc), 'handoff helper clears URL via replaceState');
assert(/searchParams\.delete\(\s*['"]key['"]\s*\)/.test(handoffSrc), 'handoff strips legacy ?key=');

const nextConfigSrc = fs.readFileSync(path.join(web, 'next.config.js'), 'utf8');
assert(/Referrer-Policy/.test(nextConfigSrc), 'Referrer-Policy configured');
assert(/no-referrer/.test(nextConfigSrc), 'account page uses Referrer-Policy: no-referrer');
assert(/['"]\/account['"]/.test(nextConfigSrc), 'Referrer-Policy scoped to /account');

/** Load the real helper via typescript transpile (works on Node 20 without strip-types). */
async function loadHandoffHelper() {
  const requireFromWeb = createRequire(path.join(web, 'package.json'));
  const ts = requireFromWeb('typescript');
  const { outputText } = ts.transpileModule(handoffSrc, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false
    },
    fileName: 'license-handoff.ts'
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csi-license-handoff-'));
  const out = path.join(dir, 'license-handoff.mjs');
  fs.writeFileSync(out, outputText);
  return import(pathToFileURL(out).href);
}

const { takeLicenseKeyFromUrl } = await loadHandoffHelper();
assert(typeof takeLicenseKeyFromUrl === 'function', 'transpiled takeLicenseKeyFromUrl loaded');

/** Mutable location + history stand-in for table-driven helper checks. */
function makeBrowse(href) {
  const u = new URL(href);
  const loc = {
    get href() {
      return u.href;
    },
    get hash() {
      return u.hash;
    },
    get search() {
      return u.search;
    },
    get pathname() {
      return u.pathname;
    }
  };
  const hist = {
    replaceState(_data, _title, next) {
      const resolved = new URL(String(next), u.origin);
      u.pathname = resolved.pathname;
      u.search = resolved.search;
      u.hash = resolved.hash;
    }
  };
  return { loc, hist, url: u };
}

const FRAG = 'CSG-FRAG-AAAA-BBBB';
const QUERY = 'CSG-QUERY-CCCC-DDDD';

const cases = [
  {
    name: 'fragment precedence over query',
    href: `https://cannabissage.app/account?key=${QUERY}&utm=1#key=${FRAG}`,
    wantKey: FRAG,
    wantHref: 'https://cannabissage.app/account?utm=1'
  },
  {
    name: 'legacy query fallback',
    href: `https://cannabissage.app/account?key=${QUERY}&ref=ext`,
    wantKey: QUERY,
    wantHref: 'https://cannabissage.app/account?ref=ext'
  },
  {
    name: 'fragment only',
    href: `https://cannabissage.app/account#key=${FRAG}`,
    wantKey: FRAG,
    wantHref: 'https://cannabissage.app/account'
  },
  {
    name: 'no key leaves unrelated query intact',
    href: 'https://cannabissage.app/account?utm=keep',
    wantKey: '',
    wantHref: 'https://cannabissage.app/account?utm=keep'
  },
  {
    name: 'empty hash and search',
    href: 'https://cannabissage.app/account',
    wantKey: '',
    wantHref: 'https://cannabissage.app/account'
  }
];

for (const c of cases) {
  const { loc, hist, url } = makeBrowse(c.href);
  const got = takeLicenseKeyFromUrl(loc, hist);
  assert(got === c.wantKey, `${c.name}: key want ${c.wantKey || '(empty)'} got ${got || '(empty)'}`);
  assert(
    url.href === c.wantHref,
    `${c.name}: href want ${c.wantHref} got ${url.href}`
  );
  assert(!/[?#]key=/.test(url.href), `${c.name}: cleaned URL must not retain key=`);
  // Second call after cleanup returns empty and stays clean.
  const again = takeLicenseKeyFromUrl(loc, hist);
  assert(again === '', `${c.name}: second call must return empty`);
  assert(url.href === c.wantHref, `${c.name}: second call must not change URL`);
}

/** Promise-aware chrome.storage.local matching MV3 (no callback → Promise). */
function makeChrome(store, opened) {
  const asPromise = (fn) => {
    return (...args) => {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const result = fn(...args);
      if (cb) {
        cb(result);
        return undefined;
      }
      return Promise.resolve(result);
    };
  };
  return {
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: (_msg, cb) => {
        if (cb) cb({ ok: false, error: 'no packaged fetch in smoke' });
      }
    },
    storage: {
      local: {
        get: asPromise((keys) => {
          if (keys == null) return { ...store };
          const list = Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
              ? [keys]
              : Object.keys(keys);
          const out = {};
          list.forEach((k) => {
            if (Object.prototype.hasOwnProperty.call(store, k)) out[k] = store[k];
          });
          return out;
        }),
        set: asPromise((obj) => {
          Object.assign(store, obj);
        }),
        remove: asPromise((keys) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            delete store[k];
          });
        })
      }
    },
    tabs: {
      create: ({ url }) => {
        opened.push(url);
        // Truthy return so openManage does not fall through to window.open.
        return { id: opened.length };
      }
    }
  };
}

const LICENSE = 'CSG-ABCD-EFGH-IJKL';
const store = {
  csi_entitlement: {
    active: true,
    licenseKey: LICENSE,
    status: 'active',
    plan: 'pro',
    expiresAt: '2099-01-01T00:00:00.000Z'
  }
};
const opened = [];
const chromeApi = makeChrome(store, opened);
const sandbox = {
  console,
  URL,
  fetch: () => Promise.reject(new Error('no network')),
  chrome: chromeApi,
  globalThis: null,
  window: null
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

function loadScripts(files, ctx) {
  for (const f of files) {
    const code = fs.readFileSync(path.join(ext, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
}

const context = vm.createContext(sandbox);
loadScripts(['lib/csi-packaged-paths.js', 'lib/csi-core.js', 'lib/csi-entitlement.js'], context);

const CSI = sandbox.CSI;
assert(CSI?.entitlement?.openManage, 'CSI.entitlement.openManage loaded');

await CSI.entitlement.openManage();
assert(opened.length === 1, `expected one tab open, got ${opened.length}`);
const url = opened[0];
assert(typeof url === 'string' && url.length, 'openManage opened a URL');
assert(!/[?&]key=/.test(url), `openManage must not use query key=; got ${url}`);
assert(
  url.includes(`#key=${encodeURIComponent(LICENSE)}`) || url.includes(`#key=${LICENSE}`),
  `openManage must use fragment #key=; got ${url}`
);
assert(/\/account(#|$)/.test(url.split('?')[0]), `openManage should target /account; got ${url}`);

// Without a stored key, open the bare account URL (no fragment either).
opened.length = 0;
delete store.csi_entitlement;
await CSI.entitlement.clearStored();
await CSI.entitlement.openManage();
assert(opened.length === 1, 'openManage opens account without a key');
assert(!/[?#]key=/.test(opened[0]), `bare manage URL must omit key; got ${opened[0]}`);

console.log('smoke-license-handoff: OK');

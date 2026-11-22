#!/usr/bin/env node
/**
 * License handoff smoke: openManage must not put the key in a query string.
 * Fragment (#key=…) is OK; the account page clears it client-side by replacing
 * the history entry (no Back to #key=). Also guards /account against third-party
 * scripts and keeps /api/license/validate POST-only.
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
assert(
  /method:\s*['"]POST['"]/.test(entitlementSrc) && /\/api\/license\/validate/.test(entitlementSrc),
  'extension validates via POST body, not GET ?key='
);
assert(
  !/\/api\/license\/validate\?/.test(entitlementSrc),
  'extension must not call validate with a query string'
);

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
assert(
  !/\/api\/license\/validate\?/.test(accountSrc),
  'account page must not call validate with a query string'
);

const handoffTsPath = path.join(web, 'lib/license-handoff.ts');
const handoffSrc = fs.readFileSync(handoffTsPath, 'utf8');
assert(/loc\.hash/.test(handoffSrc), 'handoff helper reads hash');
assert(/replaceState/.test(handoffSrc), 'handoff helper clears URL via replaceState (history replace)');
assert(
  !/\.pushState\s*\(/.test(handoffSrc),
  'handoff must not call pushState (would leave #key= in history)'
);
assert(/searchParams\.delete\(\s*['"]key['"]\s*\)/.test(handoffSrc), 'handoff strips legacy ?key=');

const nextConfigSrc = fs.readFileSync(path.join(web, 'next.config.js'), 'utf8');
assert(/Referrer-Policy/.test(nextConfigSrc), 'Referrer-Policy configured');
assert(/no-referrer/.test(nextConfigSrc), 'account page uses Referrer-Policy: no-referrer');
assert(/['"]\/account['"]/.test(nextConfigSrc), 'Referrer-Policy scoped to /account');
assert(/Content-Security-Policy/.test(nextConfigSrc), 'CSP configured for /account');

/** Parse a CSP header value into { directive: token[] }. */
function parseCspDirectives(csp) {
  const out = Object.create(null);
  for (const part of String(csp).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...tokens] = trimmed.split(/\s+/);
    out[name.toLowerCase()] = tokens;
  }
  return out;
}

/**
 * Load the real /account CSP from next.config.js and assert script-src tokens
 * are exactly the Next.js allowlist (no external hosts). Also reject a
 * script-src-elem override that would re-open third-party script hosts.
 */
function assertAccountScriptSrcAllowlist(label, configSrc) {
  const requireFromWeb = createRequire(path.join(web, 'package.json'));
  // Clear cache so a mid-run mutation of next.config.js is visible.
  const configPath = path.join(web, 'next.config.js');
  delete requireFromWeb.cache[requireFromWeb.resolve(configPath)];
  const nextConfig = requireFromWeb(configPath);
  assert(typeof nextConfig.headers === 'function', `${label}: next.config exports headers()`);
  // headers() is async in Next config; support both sync and Promise.
  return Promise.resolve(nextConfig.headers()).then((headerBlocks) => {
    const account = (headerBlocks || []).find((h) => h && h.source === '/account');
    assert(account, `${label}: /account header block present`);
    const cspHeader = (account.headers || []).find(
      (h) => h && String(h.key).toLowerCase() === 'content-security-policy'
    );
    assert(cspHeader && cspHeader.value, `${label}: Content-Security-Policy header present`);
    const directives = parseCspDirectives(cspHeader.value);
    const scriptSrc = directives['script-src'];
    assert(Array.isArray(scriptSrc) && scriptSrc.length, `${label}: script-src directive present`);
    // Exact allowlist: Next needs unsafe-inline/eval; no hosts beyond 'self'.
    const SCRIPT_SRC_ALLOWLIST = new Set(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    for (const token of scriptSrc) {
      assert(
        SCRIPT_SRC_ALLOWLIST.has(token),
        `${label}: script-src token not in allowlist: ${token}`
      );
    }
    assert(scriptSrc.includes("'self'"), `${label}: script-src must include 'self'`);
    // script-src-elem, if present, must not reopen external hosts.
    const scriptSrcElem = directives['script-src-elem'];
    if (scriptSrcElem) {
      for (const token of scriptSrcElem) {
        assert(
          SCRIPT_SRC_ALLOWLIST.has(token),
          `${label}: script-src-elem token not in allowlist: ${token}`
        );
      }
    }
    // Source still mentions the policy (guards against accidental deletion).
    assert(/script-src/.test(configSrc), `${label}: next.config source mentions script-src`);
    return cspHeader.value;
  });
}

const accountCspValue = await assertAccountScriptSrcAllowlist('account CSP', nextConfigSrc);
assert(/style-src/.test(accountCspValue), 'account CSP includes style-src for inline/React styles + fonts CSS');
assert(/font-src/.test(accountCspValue), 'account CSP includes font-src for Google Fonts');

// Item 2: /account must stay free of third-party scripts (any could read #key= before cleanup).
const layoutSrc = fs.readFileSync(path.join(web, 'app/layout.tsx'), 'utf8');
const accountLayoutPath = path.join(web, 'app/account/layout.tsx');
const accountLayoutSrc = fs.existsSync(accountLayoutPath)
  ? fs.readFileSync(accountLayoutPath, 'utf8')
  : '';
const THIRD_PARTY_SCRIPT_RE =
  /googletagmanager|google-analytics|gtag\(|plausible\.io|segment\.(io|com)|hotjar|facebook\.net|doubleclick|clarity\.ms|cdn\.amplitude|fullstory|heap-api|newrelic|sentry\.io\/scripts|js\.stripe\.com|checkout\.stripe\.com/i;

function assertNoThirdPartyScripts(label, src) {
  assert(!/<script[^>]+src=["']https?:\/\//i.test(src), `${label}: no external <script src=http(s)>`);
  assert(
    !/\bnext\/script\b/.test(src) || !/src=["']https?:\/\//i.test(src),
    `${label}: next/script must not load an external https? URL`
  );
  assert(!THIRD_PARTY_SCRIPT_RE.test(src), `${label}: no third-party analytics/script hosts`);
}

assertNoThirdPartyScripts('account page', accountSrc);
assertNoThirdPartyScripts('root layout', layoutSrc);
if (accountLayoutSrc) assertNoThirdPartyScripts('account layout', accountLayoutSrc);

// Item 4: validate is POST-only; GET returns 405 (no query-string key path).
const validateSrc = fs.readFileSync(path.join(web, 'app/api/license/validate/route.ts'), 'utf8');
assert(/export async function POST/.test(validateSrc), 'validate exports POST');
assert(/export async function GET/.test(validateSrc), 'validate exports GET (405 only)');
assert(/status:\s*405/.test(validateSrc), 'validate GET returns 405');
assert(/Allow['"]?\s*:\s*['"]POST['"]/.test(validateSrc), 'validate GET Allow: POST');
assert(
  !/searchParams\.get\(\s*['"]key['"]\s*\)/.test(validateSrc),
  'validate must not read key from query string'
);

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

/**
 * Mutable location + history stand-in. replaceState replaces the current history
 * entry (location.replace equivalent for history); pushState must never be used.
 */
function makeBrowse(href) {
  const u = new URL(href);
  const stack = [u.href];
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
  let replaceCalls = 0;
  const hist = {
    replaceState(_data, _title, next) {
      replaceCalls += 1;
      const resolved = new URL(String(next), u.origin);
      u.pathname = resolved.pathname;
      u.search = resolved.search;
      u.hash = resolved.hash;
      stack[stack.length - 1] = u.href;
    },
    pushState() {
      throw new Error('pushState must not be used — would leave #key= in history');
    }
  };
  return { loc, hist, url: u, stack, get replaceCalls() { return replaceCalls; } };
}

const FRAG = 'CSG-FRAG-AAAA-BBBB';
const QUERY = 'CSG-QUERY-CCCC-DDDD';

const cases = [
  {
    name: 'fragment precedence over query',
    href: `https://cannabissage.app/account?key=${QUERY}&utm=1#key=${FRAG}`,
    wantKey: FRAG,
    wantHref: 'https://cannabissage.app/account?utm=1',
    expectReplace: true
  },
  {
    name: 'legacy query fallback',
    href: `https://cannabissage.app/account?key=${QUERY}&ref=ext`,
    wantKey: QUERY,
    wantHref: 'https://cannabissage.app/account?ref=ext',
    expectReplace: true
  },
  {
    name: 'fragment only',
    href: `https://cannabissage.app/account#key=${FRAG}`,
    wantKey: FRAG,
    wantHref: 'https://cannabissage.app/account',
    expectReplace: true
  },
  {
    name: 'no key leaves unrelated query intact',
    href: 'https://cannabissage.app/account?utm=keep',
    wantKey: '',
    wantHref: 'https://cannabissage.app/account?utm=keep',
    expectReplace: false
  },
  {
    name: 'empty hash and search',
    href: 'https://cannabissage.app/account',
    wantKey: '',
    wantHref: 'https://cannabissage.app/account',
    expectReplace: false
  }
];

for (const c of cases) {
  const browse = makeBrowse(c.href);
  const { loc, hist, url, stack } = browse;
  const got = takeLicenseKeyFromUrl(loc, hist);
  assert(got === c.wantKey, `${c.name}: key want ${c.wantKey || '(empty)'} got ${got || '(empty)'}`);
  assert(
    url.href === c.wantHref,
    `${c.name}: href want ${c.wantHref} got ${url.href}`
  );
  assert(!/[?#]key=/.test(url.href), `${c.name}: cleaned URL must not retain key=`);
  if (c.expectReplace) {
    assert(browse.replaceCalls === 1, `${c.name}: must replace history entry once`);
    assert(stack.length === 1, `${c.name}: history length must stay 1 (replace, not push)`);
    assert(!/[?#]key=/.test(stack[0]), `${c.name}: history entry must not retain key=`);
  } else {
    assert(browse.replaceCalls === 0, `${c.name}: no replace when nothing to clear`);
  }
  // Second call after cleanup returns empty and stays clean.
  const again = takeLicenseKeyFromUrl(loc, hist);
  assert(again === '', `${c.name}: second call must return empty`);
  assert(url.href === c.wantHref, `${c.name}: second call must not change URL`);
}

// Item 7: dedicated "second call after cleanup" case.
{
  const browse = makeBrowse(`https://cannabissage.app/account#key=${FRAG}`);
  const first = takeLicenseKeyFromUrl(browse.loc, browse.hist);
  assert(first === FRAG, 'second-call case: first call returns fragment key');
  assert(browse.url.href === 'https://cannabissage.app/account', 'second-call case: URL cleared');
  assert(browse.replaceCalls === 1, 'second-call case: history entry replaced');
  assert(!/[?#]key=/.test(browse.stack[0]), 'second-call case: history has no key=');
  const second = takeLicenseKeyFromUrl(browse.loc, browse.hist);
  assert(second === '', 'second-call case: after cleanup, takeLicenseKeyFromUrl returns no key');
  assert(browse.replaceCalls === 1, 'second-call case: second call does not replace again');
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

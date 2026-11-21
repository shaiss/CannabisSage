#!/usr/bin/env node
/**
 * Fail-closed expiresAt checks for Pro entitlement (Cipher LOW / #63 / #71).
 * Run: node scripts/smoke-entitlement-expiry.mjs
 */
import assert from 'assert';
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
        get(keys, cb) {
          const out = {};
          if (keys == null) Object.assign(out, store);
          else {
            const list = Array.isArray(keys)
              ? keys
              : typeof keys === 'string'
                ? [keys]
                : Object.keys(keys);
            list.forEach((k) => {
              if (Object.prototype.hasOwnProperty.call(store, k)) out[k] = store[k];
            });
          }
          if (typeof cb === 'function') {
            cb(out);
            return undefined;
          }
          return Promise.resolve(out);
        },
        set(obj, cb) {
          Object.assign(store, obj);
          if (typeof cb === 'function') cb();
          else return Promise.resolve();
        },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]);
          if (typeof cb === 'function') cb();
          else return Promise.resolve();
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
  ['lib/csi-packaged-paths.js', 'lib/csi-core.js', 'lib/csi-entitlement.js'],
  vm.createContext(sandbox)
);

const CSI = sandbox.CSI;
const isProFromRecord = CSI.entitlement.isProFromRecord;
assert(typeof isProFromRecord === 'function', 'isProFromRecord exported');

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

assert(
  isProFromRecord({ active: true, expiresAt: '2099-01-01T00:00:00.000Z' }, NOW) === true,
  'future valid date => Pro'
);
assert(
  isProFromRecord({ active: true, expiresAt: '2020-01-01T00:00:00.000Z' }, NOW) === false,
  'past date => not Pro'
);
assert(
  isProFromRecord({ active: true, expiresAt: 'garbage-not-a-date' }, NOW) === false,
  'unparseable string => not Pro'
);
assert(
  isProFromRecord({ active: true, expiresAt: 1735689600000 }, NOW) === false,
  'non-string number expiresAt => not Pro'
);
assert(
  isProFromRecord({ active: true, expiresAt: { iso: '2099-01-01' } }, NOW) === false,
  'non-string object expiresAt => not Pro'
);
assert(
  isProFromRecord({ active: true }, NOW) === true,
  'missing expiresAt => lifetime Pro (server may omit period end)'
);
assert(
  isProFromRecord({ active: true, expiresAt: null }, NOW) === true,
  'null expiresAt => lifetime Pro'
);
assert(
  isProFromRecord({ active: true, expiresAt: '' }, NOW) === true,
  'empty expiresAt => lifetime Pro'
);
assert(
  isProFromRecord({ active: false, expiresAt: '2099-01-01T00:00:00.000Z' }, NOW) === false,
  'inactive => not Pro'
);
assert(isProFromRecord(null, NOW) === false, 'null record => not Pro');

/** Pre-fix fail-open logic — mutation check must keep this returning true. */
function isProFromRecordOld(rec, now = Date.now()) {
  if (!rec || !rec.active) return false;
  if (rec.expiresAt) {
    const t = Date.parse(rec.expiresAt);
    if (!Number.isNaN(t) && t < now) return false;
  }
  return true;
}

const garbageRec = { active: true, expiresAt: 'not-a-real-date' };
assert(
  isProFromRecordOld(garbageRec, NOW) === true,
  'mutation: old code treats unparseable expiresAt as Pro (fail-open)'
);
assert(
  isProFromRecord(garbageRec, NOW) === false,
  'mutation: fixed code treats unparseable expiresAt as not Pro'
);

const entitlementSrc = fs.readFileSync(path.join(ext, 'lib/csi-entitlement.js'), 'utf8');
assert(
  /typeof exp !== 'string'/.test(entitlementSrc) || /typeof .*expiresAt.*!== 'string'/.test(entitlementSrc),
  'extension fail-closed type check present'
);
assert(
  /Number\.isNaN\(t\) \|\| t < now/.test(entitlementSrc),
  'extension treats NaN parse as expired'
);
assert(
  !/if \(!Number\.isNaN\(t\) && t < now\) return false;/.test(entitlementSrc),
  'extension no longer skips unparseable expiry'
);

const licensesSrc = fs.readFileSync(path.join(root, 'web/lib/licenses.ts'), 'utf8');
assert(
  /typeof endRaw !== 'string'/.test(licensesSrc),
  'server isEntitlementActive fail-closed type check present'
);
assert(
  /Number\.isNaN\(end\) \|\| end < now\.getTime\(\)/.test(licensesSrc),
  'server treats NaN parse as inactive'
);
assert(
  !/if \(!Number\.isNaN\(end\) && end < now\.getTime\(\)\) return false;/.test(licensesSrc),
  'server no longer skips unparseable period end'
);

// Mirror server rule for documentation parity (TypeScript not executed here).
function isEntitlementActiveMirror(record, nowMs) {
  if (!record) return false;
  if (record.status !== 'active' && record.status !== 'past_due') return false;
  const endRaw = record.currentPeriodEnd;
  if (endRaw == null || endRaw === '') return true;
  if (typeof endRaw !== 'string') return false;
  const end = Date.parse(endRaw);
  if (Number.isNaN(end) || end < nowMs) return false;
  return true;
}
assert(
  isEntitlementActiveMirror(
    { status: 'active', currentPeriodEnd: 'garbage' },
    NOW
  ) === false,
  'server mirror: unparseable currentPeriodEnd => inactive'
);
assert(
  isEntitlementActiveMirror({ status: 'active', currentPeriodEnd: null }, NOW) === true,
  'server mirror: null currentPeriodEnd => lifetime active'
);

console.log('smoke-entitlement-expiry: OK');

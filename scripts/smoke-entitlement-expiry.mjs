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
  !entitlementSrc.includes('if (!Number.isNaN(t) && t < now) return false;'),
  'extension no longer fail-opens when Date.parse is NaN'
);

const licensesSrc = fs.readFileSync(path.join(root, 'web/lib/licenses.ts'), 'utf8');
assert(
  !licensesSrc.includes('if (!Number.isNaN(end) && end < now.getTime()) return false;'),
  'server no longer fail-opens when period-end parse is NaN'
);

/**
 * Load production isEntitlementActive from licenses.ts (strip the TS signature only).
 * @returns {(record: object|null, now?: Date) => boolean}
 */
function loadIsEntitlementActive() {
  const match = licensesSrc.match(/export function isEntitlementActive\([\s\S]*?\n\}/);
  assert(match, 'locate production isEntitlementActive in licenses.ts');
  const body = match[0].replace(
    /export function isEntitlementActive\([^)]*\)[^{]*/,
    'function isEntitlementActive(record, now = new Date()) '
  );
  return vm.runInNewContext(`${body}\nisEntitlementActive;`, { Date, Number });
}

const isEntitlementActive = loadIsEntitlementActive();
const nowDate = new Date(NOW);
const baseRec = {
  licenseKey: 'CSG-AAAA-BBBB-CCCC',
  email: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  createdAt: '',
  updatedAt: ''
};

assert(
  isEntitlementActive(
    { ...baseRec, status: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' },
    nowDate
  ) === true,
  'server: future valid currentPeriodEnd => active'
);
assert(
  isEntitlementActive(
    { ...baseRec, status: 'active', currentPeriodEnd: '2020-01-01T00:00:00.000Z' },
    nowDate
  ) === false,
  'server: past currentPeriodEnd => inactive'
);
assert(
  isEntitlementActive({ ...baseRec, status: 'active', currentPeriodEnd: 'garbage' }, nowDate) ===
    false,
  'server: unparseable currentPeriodEnd => inactive'
);
assert(
  isEntitlementActive({ ...baseRec, status: 'active', currentPeriodEnd: null }, nowDate) === true,
  'server: null currentPeriodEnd => lifetime active'
);
assert(
  isEntitlementActive({ ...baseRec, status: 'active', currentPeriodEnd: '' }, nowDate) === true,
  'server: empty currentPeriodEnd => lifetime active'
);
assert(
  isEntitlementActive(
    { ...baseRec, status: 'inactive', currentPeriodEnd: '2099-01-01T00:00:00.000Z' },
    nowDate
  ) === false,
  'server: inactive status => inactive'
);
assert(
  isEntitlementActive(
    { ...baseRec, status: 'past_due', currentPeriodEnd: '2099-01-01T00:00:00.000Z' },
    nowDate
  ) === true,
  'server: past_due with future end => active'
);
assert(isEntitlementActive(null, nowDate) === false, 'server: null record => inactive');

console.log('smoke-entitlement-expiry: OK');

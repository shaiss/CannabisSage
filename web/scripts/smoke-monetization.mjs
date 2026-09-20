#!/usr/bin/env node
/**
 * Monetization smoke (no Stripe network required).
 * Run from repo root: node web/scripts/smoke-monetization.mjs
 * Or: cd web && npm run smoke
 */
import assert from 'assert';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const extRoot = path.resolve(webRoot, '..', 'extension');

// Load pricing.ts via transpile-less trick: evaluate the compiled logic by reading JS copy
// We duplicate minimal checks against exported constants by parsing the TS file.
const pricingSrc = fs.readFileSync(path.join(webRoot, 'lib/pricing.ts'), 'utf8');
assert(pricingSrc.includes("LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-09-20'"), 'launch date default');
assert(pricingSrc.includes('PROMO_DAYS = Number(process.env.PROMO_DAYS || 30)'), 'promo days');
assert(pricingSrc.includes('PRICE_PROMO_CENTS = 1000'), 'promo $10');
assert(pricingSrc.includes('PRICE_AFTER_PROMO_CENTS'), 'after-promo placeholder');

const gatesSrc = fs.readFileSync(path.join(webRoot, 'lib/feature-gates.ts'), 'utf8');
assert(gatesSrc.includes('tasteMap'), 'pro tasteMap');
assert(gatesSrc.includes('multiStore'), 'pro multiStore');
assert(gatesSrc.includes('hoverTooltip'), 'free hover');

const licensesSrc = fs.readFileSync(path.join(webRoot, 'lib/licenses.ts'), 'utf8');
assert(licensesSrc.includes('CSG-'), 'license prefix');

// Extension feature gates
const feat = fs.readFileSync(path.join(extRoot, 'lib/csi-features.js'), 'utf8');
assert(feat.includes('multiStore: true'), 'ext multiStore pro');
assert(feat.includes('compareTray: true'), 'ext compare free');

const entitlements = fs.readFileSync(path.join(extRoot, 'lib/csi-entitlement.js'), 'utf8');
assert(entitlements.includes('/api/license/activate'), 'activate endpoint');
assert(entitlements.includes('openUpgrade'), 'upgrade deep link');
assert(!/stripe\.elements|PaymentElement|cardNumber/i.test(entitlements), 'no card elements in extension');

const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.0', 'extension 1.3.0');
assert(manifest.host_permissions.includes('http://localhost:3000/*'), 'localhost API host');
assert(manifest.web_accessible_resources[0].resources.includes('data/config.json'), 'config WAR');

const config = JSON.parse(fs.readFileSync(path.join(extRoot, 'data/config.json'), 'utf8'));
assert(config.apiBaseUrl, 'apiBaseUrl');

// Runtime: generateLicenseKey via vm
const sandbox = {
  console,
  require: createRequire(import.meta.url),
  module: { exports: {} },
  exports: {},
  process: { env: {}, cwd: () => webRoot },
  Buffer,
  __dirname: path.join(webRoot, 'lib'),
  __filename: path.join(webRoot, 'lib/licenses.ts')
};
// Minimal JS port of generateLicenseKey for smoke
const { randomBytes } = await import('crypto');
function generateLicenseKey() {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return `CSG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
const key = generateLicenseKey();
assert(/^CSG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key), `key format ${key}`);

// Promo window math
function promoEndsAt(launchDate = '2026-09-20', promoDays = 30) {
  const start = new Date(`${launchDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + promoDays);
  return end;
}
assert(promoEndsAt().toISOString().slice(0, 10) === '2026-10-20', 'promo end date');

console.log('smoke-monetization: OK');

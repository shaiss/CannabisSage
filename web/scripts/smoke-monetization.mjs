#!/usr/bin/env node
/**
 * Monetization smoke (no Stripe / Neon network required by default).
 * Run from repo root: node web/scripts/smoke-monetization.mjs
 * Or: cd web && npm run smoke
 *
 * Optional live path (Assay / Cipher gate): set SMOKE_LIVE=1 with test-mode
 * Stripe + DATABASE_URL — still must not use prod keys.
 */
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const extRoot = path.resolve(webRoot, '..', 'extension');

const pricingSrc = fs.readFileSync(path.join(webRoot, 'lib/pricing.ts'), 'utf8');
assert(pricingSrc.includes("LAUNCH_DATE = process.env.LAUNCH_DATE || '2026-09-20'"), 'launch date default');
assert(pricingSrc.includes('PROMO_DAYS = Number(process.env.PROMO_DAYS || 30)'), 'promo days');
assert(pricingSrc.includes('PRICE_PROMO_YEAR_CENTS = 900'), 'promo $9/yr');
assert(pricingSrc.includes('PRICE_PROMO_MONTH_CENTS = 400'), 'promo $4/mo');
assert(pricingSrc.includes('PRICE_REGULAR_YEAR_CENTS = 5900'), 'regular $59/yr');
assert(pricingSrc.includes('STRIPE_PRICE_ID_PROMO'), 'promo annual env');
assert(pricingSrc.includes('STRIPE_PRICE_ID_PROMO_MONTHLY'), 'promo monthly env');
assert(pricingSrc.includes('STRIPE_PRICE_ID_REGULAR_ANNUAL'), 'regular annual env');
assert(pricingSrc.includes('STRIPE_PRICE_ID_REGULAR_MONTHLY'), 'regular monthly env');
assert(pricingSrc.includes('STRIPE_PRICE_ID_AFTER_PROMO'), 'after-promo alias');
assert(pricingSrc.includes('STRIPE_PRICE_ID'), 'price id alias');

const gatesSrc = fs.readFileSync(path.join(webRoot, 'lib/feature-gates.ts'), 'utf8');
assert(gatesSrc.includes('tasteMap'), 'pro tasteMap');
assert(gatesSrc.includes('multiStore'), 'pro multiStore');
assert(gatesSrc.includes('hoverTooltip'), 'free hover');

const licensesSrc = fs.readFileSync(path.join(webRoot, 'lib/licenses.ts'), 'utf8');
assert(licensesSrc.includes('CSG-'), 'license prefix');
assert(licensesSrc.includes('hasDatabaseUrl'), 'neon gate');
assert(licensesSrc.includes('allowDevFileStore'), 'dev file fallback gate');
assert(licensesSrc.includes('upsertLicense'), 'sole CRUD upsert');
assert(licensesSrc.includes('getLicense'), 'sole CRUD get');

const dbSrc = fs.readFileSync(path.join(webRoot, 'lib/db.ts'), 'utf8');
assert(dbSrc.includes('@neondatabase/serverless'), 'neon driver');
assert(dbSrc.includes('DATABASE_URL'), 'DATABASE_URL');
assert(dbSrc.includes('POSTGRES_URL'), 'POSTGRES_URL alias');
assert(dbSrc.includes('ALLOW_DEV_MOCK'), 'dev mock gate');

const migration = fs.readFileSync(
  path.join(webRoot, 'db/migrations/001_licenses.sql'),
  'utf8'
);
assert(migration.includes('CREATE TABLE IF NOT EXISTS licenses'), 'licenses table');
assert(migration.includes('license_key'), 'license_key column');
assert(migration.includes('stripe_customer_id'), 'stripe_customer_id');
assert(migration.includes('stripe_subscription_id'), 'stripe_subscription_id');
assert(migration.includes('current_period_end'), 'current_period_end');

const envExample = fs.readFileSync(path.join(webRoot, '.env.example'), 'utf8');
assert(envExample.includes('DATABASE_URL='), 'env DATABASE_URL');
assert(envExample.includes('STRIPE_SECRET_KEY='), 'env STRIPE_SECRET_KEY');
assert(envExample.includes('STRIPE_WEBHOOK_SECRET='), 'env STRIPE_WEBHOOK_SECRET');
assert(envExample.includes('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY='), 'env publishable key');
assert(envExample.includes('STRIPE_PRICE_ID_PROMO='), 'env promo annual');
assert(envExample.includes('STRIPE_PRICE_ID_PROMO_MONTHLY='), 'env promo monthly');
assert(envExample.includes('STRIPE_PRICE_ID_REGULAR_ANNUAL='), 'env regular annual');
assert(envExample.includes('STRIPE_PRICE_ID_REGULAR_MONTHLY='), 'env regular monthly');
assert(envExample.includes('cannabissage.app'), 'prod site URL documented');
assert(envExample.includes('cannabissage.vercel.app'), 'vercel fallback documented');
assert(!/sk_live_|whsec_[A-Za-z0-9]{20,}/.test(envExample), 'no live secrets in .env.example');

const pkg = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8'));
assert(pkg.dependencies['@neondatabase/serverless'], 'neon dep in package.json');
assert(pkg.dependencies.stripe, 'stripe dep');

const webhookSrc = fs.readFileSync(path.join(webRoot, 'app/api/webhook/route.ts'), 'utf8');
assert(webhookSrc.includes('STRIPE_WEBHOOK_SECRET'), 'webhook secret verify');
assert(webhookSrc.includes('checkout.session.completed'), 'checkout completed');
assert(webhookSrc.includes("console.log('stripe webhook', event.type)"), 'log type only');

const checkoutSrc = fs.readFileSync(path.join(webRoot, 'app/api/checkout/route.ts'), 'utf8');
assert(checkoutSrc.includes("mode: 'subscription'"), 'hosted subscription checkout');
assert(checkoutSrc.includes('resolveStripePriceId'), 'env price id');
assert(checkoutSrc.includes('billing_interval'), 'interval metadata');
assert(checkoutSrc.includes('interval'), 'checkout interval body');
assert(checkoutSrc.includes('/success?session_id='), 'success url');
assert(checkoutSrc.includes('/cancel'), 'cancel url');

const fulfillmentSrc = fs.readFileSync(path.join(webRoot, 'lib/fulfillment.ts'), 'utf8');
assert(fulfillmentSrc.includes('CSG_KEY_RE'), 'CSG key sanitize before Stripe search');
assert(fulfillmentSrc.includes('subscriptions.search'), 'stripe subscription search');
assert(fulfillmentSrc.includes("CSG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}"), 'CSG pattern');

// Extension feature gates
const feat = fs.readFileSync(path.join(extRoot, 'lib/csi-features.js'), 'utf8');
assert(feat.includes('multiStore: true'), 'ext multiStore pro');
assert(feat.includes('compareTray: true'), 'ext compare free');

const entitlements = fs.readFileSync(path.join(extRoot, 'lib/csi-entitlement.js'), 'utf8');
assert(entitlements.includes('/api/license/activate'), 'activate endpoint');
assert(entitlements.includes('openUpgrade'), 'upgrade deep link');
assert(!/stripe\.elements|PaymentElement|cardNumber/i.test(entitlements), 'no card elements in extension');

const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8'));
assert(manifest.version === '1.3.5', 'extension 1.3.5');
assert(manifest.host_permissions.includes('https://cannabissage.app/*'), 'prod API host (custom domain)');
assert(manifest.host_permissions.includes('https://cannabissage.vercel.app/*'), 'prod API host (vercel fallback)');
assert(manifest.host_permissions.includes('http://localhost:3000/*'), 'localhost API host (unpacked local/dev)');
assert(manifest.web_accessible_resources[0].resources.includes('data/config.json'), 'config WAR');

const config = JSON.parse(fs.readFileSync(path.join(extRoot, 'data/config.json'), 'utf8'));
assert(config.apiBaseUrl === 'https://cannabissage.app', 'prod apiBaseUrl');
assert(config.upgradeUrl.includes('cannabissage.app'), 'prod upgradeUrl');
assert(config.accountUrl.includes('cannabissage.app'), 'prod accountUrl');

function generateLicenseKey() {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return `CSG-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}
const key = generateLicenseKey();
assert(/^CSG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key), `key format ${key}`);

function promoEndsAt(launchDate = '2026-09-20', promoDays = 30) {
  const start = new Date(`${launchDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + promoDays);
  return end;
}
assert(promoEndsAt().toISOString().slice(0, 10) === '2026-10-20', 'promo end date');

if (process.env.SMOKE_LIVE === '1') {
  const hasDb = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  assert(hasDb, 'SMOKE_LIVE requires DATABASE_URL or POSTGRES_URL');
  assert(stripeKey.startsWith('sk_test_'), 'SMOKE_LIVE requires Stripe test secret (sk_test_)');
  assert(!stripeKey.startsWith('sk_live_'), 'SMOKE_LIVE must not use live Stripe keys');
  console.log('smoke-monetization: SMOKE_LIVE env gate OK (network checks left to Assay)');
}

console.log('smoke-monetization: OK');

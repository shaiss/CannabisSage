#!/usr/bin/env node
/**
 * Partner registry smoke: schema + denylist-wins filtering.
 * Run from repo root: node scripts/smoke-partners.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listSupportedPartners,
  normalizeHost,
  parsePartnersDocument
} from './lib/partners-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const partnersPath = path.join(root, 'web', 'public', 'partners.json');
const denylistPath = path.join(root, 'web', 'public', 'denylist.json');
assert(fs.existsSync(partnersPath), 'web/public/partners.json');
assert(fs.existsSync(denylistPath), 'web/public/denylist.json');

const partnersDoc = JSON.parse(fs.readFileSync(partnersPath, 'utf8'));
const denylistDoc = JSON.parse(fs.readFileSync(denylistPath, 'utf8'));

assert(partnersDoc.version === 1, 'partners version 1');
assert(typeof partnersDoc.updatedAt === 'string' && partnersDoc.updatedAt.includes('T'), 'updatedAt ISO');
assert(Array.isArray(partnersDoc.partners) && partnersDoc.partners.length >= 1, 'partners array');

const parsed = parsePartnersDocument(partnersDoc);
assert(parsed, 'partners payload parses');
assert(parsed.partners.length === 2, 'two unique seeded hosts');

const hosts = parsed.partners.map((p) => p.host);
assert(hosts.includes('sunnyside.shop'), 'sunnyside.shop seeded');
assert(hosts.includes('zenleafdispensaries.com'), 'zenleafdispensaries.com seeded');
assert(!hosts.includes('www.sunnyside.shop'), 'www. stripped in parse');
assert(!hosts.some((h) => /terravidahc|terravida\.com/.test(h)), 'no invented TerraVida host');

for (const p of parsed.partners) {
  assert(p.status === 'community', `${p.host} first-wave community`);
  assert(typeof p.displayName === 'string' && p.displayName.trim(), 'ops displayName');
}

assert(
  normalizeHost('www.sunnyside.shop') === 'sunnyside.shop',
  'www. normalize matches denylist'
);
assert(normalizeHost('ZenLeafDispensaries.com') === 'zenleafdispensaries.com', 'lowercase host');

const visible = listSupportedPartners(partnersDoc, denylistDoc);
assert(visible.length === parsed.partners.length, 'empty denylist does not hide seeds');
assert(
  visible.every((p) => p.status !== 'denied'),
  'denied status omitted'
);

const denySunnyside = { version: 1, hosts: ['www.sunnyside.shop'] };
const afterDeny = listSupportedPartners(partnersDoc, denySunnyside);
assert(
  afterDeny.every((p) => p.host !== 'sunnyside.shop'),
  'denylist wins over community (www. normalized)'
);
assert(
  afterDeny.some((p) => p.host === 'zenleafdispensaries.com'),
  'other hosts still listed'
);

const withDeniedStatus = {
  version: 1,
  updatedAt: '2026-10-04T00:00:00.000Z',
  partners: [
    { host: 'sunnyside.shop', status: 'community', displayName: 'Sunnyside' },
    { host: 'example-paused.shop', status: 'denied', displayName: 'Paused' },
    { host: 'partner.example', status: 'verified', displayName: 'Partner Co' }
  ]
};
const mixed = listSupportedPartners(withDeniedStatus, { hosts: [] });
assert(
  mixed.map((p) => p.host).join(',') === 'sunnyside.shop,partner.example',
  'denied registry rows omitted; verified kept when not on denylist'
);
const verifiedHidden = listSupportedPartners(withDeniedStatus, { hosts: ['partner.example'] });
assert(
  !verifiedHidden.some((p) => p.host === 'partner.example'),
  'denylist wins over verified'
);

const dupes = parsePartnersDocument({
  version: 1,
  partners: [
    { host: 'www.sunnyside.shop', status: 'community', displayName: 'First' },
    { host: 'sunnyside.shop', status: 'verified', displayName: 'Second' }
  ]
});
assert(dupes.partners.length === 1 && dupes.partners[0].displayName === 'First', 'first host wins');

const cfg = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'data', 'config.json'), 'utf8'));
assert(cfg.partnersPath === '/partners.json', 'partnersPath in extension config');
assert(cfg.denylistPath === '/denylist.json', 'denylistPath unchanged');

const adaptersMd = fs.readFileSync(path.join(root, 'docs', 'ADAPTERS.md'), 'utf8');
assert(adaptersMd.includes('PARTNERS.md'), 'ADAPTERS points at partners ops doc');
const partnersMd = fs.readFileSync(path.join(root, 'docs', 'PARTNERS.md'), 'utf8');
assert(partnersMd.includes('https://cannabissage.app/partners.json'), 'prod partners URL');
assert(/DNS|well-known/i.test(partnersMd), 'later DNS proof documented');
assert(!/dns\.promises|resolveTxt|well-known\/cannabissage/i.test(
  fs.readFileSync(path.join(root, 'web', 'lib', 'partners.ts'), 'utf8')
), 'no DNS implementation in partners.ts');

console.log('smoke-partners: ok');

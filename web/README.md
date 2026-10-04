# CannabisSage web

Next.js (App Router) landing page + Stripe Checkout + Neon license entitlement API.

See [`../docs/MONETIZATION.md`](../docs/MONETIZATION.md).

**Prod:** `https://cannabissage.app` (Vercel fallback: `https://cannabissage.vercel.app`)

Public config JSON (not executable code): [`public/denylist.json`](public/denylist.json), [`public/partners.json`](public/partners.json). Ops: [`../docs/DENYLIST.md`](../docs/DENYLIST.md), [`../docs/PARTNERS.md`](../docs/PARTNERS.md).

```bash
cp .env.example .env.local   # DATABASE_URL + Stripe test keys; never commit secrets
npm install
npm run dev
npm run smoke                # offline monetization checks
```

Licenses: Neon via `DATABASE_URL` (schema `db/migrations/001_licenses.sql`). Local `.data` file store only when `ALLOW_DEV_MOCK=1` and no DB URL.

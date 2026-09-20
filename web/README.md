# CannabisSage web

Next.js (App Router) landing page + Stripe Checkout + Neon license entitlement API.

See [`../docs/MONETIZATION.md`](../docs/MONETIZATION.md).

**Prod alias:** `https://cannabissage.vercel.app`

```bash
cp .env.example .env.local   # DATABASE_URL + Stripe test keys; never commit secrets
npm install
npm run dev
npm run smoke                # offline monetization checks
```

Licenses: Neon via `DATABASE_URL` (schema `db/migrations/001_licenses.sql`). Local `.data` file store only when `ALLOW_DEV_MOCK=1` and no DB URL.

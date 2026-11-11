# FreshPrep — Local UAT checklist

**Branch:** `feat/typescript-platform-foundation` (draft PR #1)

## Website: sample catalogue and operations

```powershell
cd C:\Projects\cut-vegetables
git checkout feat/typescript-platform-foundation
git pull origin feat/typescript-platform-foundation
npm install
npm run typecheck
npm test
npm run web:test
npm run web:build
```

Start API with `npm run dev` and website in a second terminal with `npm run dev --workspace @freshprep/web`. Open http://127.0.0.1:5173.

Expected **fresh local demo** results:
- 100 example SKU variants across 25 vegetables, three sample delivery slots
- Search for Potato, 10 mm; Carrot, grated fine/coarse; Onion, chopped 5/10/20 mm
- Choose quantity, delivery date and slot; attempt invalid past-cutoff order and expect refusal
- Set Mon/Wed/Fri recurrence (saved only; scheduled generation is not active)
- Operations: see 100 variants, 25 vegetables, 0 orders initially, current preparation mix, slot capacity, roles
- Add a sample order and refresh admin: order count increases and no invented revenue is displayed
- Hero slider, announcements, slot configuration and catalogue creation are local demo-only
- Restarting API clears in-memory orders and manual edits, then 100 sample SKUs reload automatically

**Known issue:** sample vegetable imagery is generic (not reliably cut-specific), and sample prices are fictitious. Admin and mobile demonstration role switching is NOT authentication.

## Separate PostgreSQL sample seed

With the migrations applied to a disposable database, the sample catalogue can be added explicitly (never in production):

```powershell
cd apps\api
$env:DATABASE_URL='postgresql://...'
$env:FRESHPREP_DEMO_DB_SEED='YES_I_WANT_SAMPLE_DATA'
npm run db:seed-demo
```

This seeds the 100 sample variants idempotently into the PostgreSQL catalogue; it is not connected to the local web UI. The UI still uses the in-memory API on port 3000. NEVER run this on business production data.

## Single mobile app

```powershell
cd apps\mobile
npm install
npx expo install --check
npm start
```

On an Android emulator use the default API `http://10.0.2.2:3000`. The role switcher shows customer/buyer, procurement, store, cutter, operator, QC, packer, delivery/dispatch, admin, finance and sales menus. This is a UI demo, not secure authorization. Secure HTTPS is required before physical-phone testing against a shared API.

## Release blockers
- Real authentication and RBAC in all web/mobile endpoints
- Durable PostgreSQL order/recurrence/stock workflows, idempotent generation and event geo audits
- Production work orders, QC and packing approvals, dispatch route assignments, driver POD
- Real customer addresses/organizations, contracts, accurate prices, actual cut-variant photos
- Promotion/loyalty ledger, GST invoices, settlement and returns
- Measured line/branch coverage, integration/security/E2E tests, staging deployment and backup/restore

No local or CI tests have been reported as passed in this commit; their execution is required.

# FreshPrep release verification checklist — updated 31 October 2026

**Scope:** `bv-prasanna/cut-vegetables`, branch `feat/typescript-platform-foundation`, draft PR #1.

## Install and static quality gates (Windows PowerShell)
```powershell
cd C:\Projects\cut-vegetables
git checkout feat/typescript-platform-foundation
git pull origin feat/typescript-platform-foundation

npm install --no-audit --no-fund
npm run check

cd apps\mobile
npm install --no-audit --no-fund
npm run typecheck
npm test
npx expo install --check
cd ..\..
```

Do not merge if any check fails. The assistant has **not** run these checks or claimed coverage.

## Real PostgreSQL setup & bootstrap
Apply `0001`–`0008` migrations to a disposable staging DB; only a secure local CLI may create the first Super Admin. Use a 48-byte random JWT secret and HTTPS API host with exact allowed frontend origins. Validate:
- Login rejects wrong password / organisation and returns a 15-minute signed JWT.
- Forged/expired/revoked JWT returns 401; roles are not taken from request headers or screens.
- A customer cannot access another customer's orders/recurrences; staff cannot read another producer organisation.
- Super Admin can create staff roles, customer business/kitchen, vegetables, prep variants and delivery slots.
- Ordinary ADMIN cannot change globally shared product master or slots; customer cannot change staff roles.
- Production API must have no active `/dev/*` routes, and staging data must not be exposed publicly.

## Business UAT — order to delivery
1. Create two customer kitchens assigned to producer org and a compatible delivery zone.
2. Configure 5–8 AM and 2–5 PM slots, including the expected booking cutoff.
3. Customer A and B order the same cut size. Confirm cutter board aggregates required kg by date/slot/size, while packing remains customer-order-specific.
4. Verify procurement supplier → purchase order → received raw lot; ensure usable and rejected grams reconcile.
5. Cutter starts a batch only with matching vegetable and sufficient raw stock; check consumed stock is never negative.
6. QC passes/rejects a weighed batch. A failed QC blocks packing and flags the order; partial QC should not mark all items ready.
7. Packer records labelled units and use-by; order PACKED only when each order line is fully packed.
8. Dispatch assigns only packed orders with matching run date/slot and valid driver membership.
9. Driver receives only their assigned stops; POD stores GPS with consent or explicit unavailability and changes order to DELIVERED.
10. For recurring orders: create schedule, pause/resume, skip delivery, generate upcoming date, run generator twice (no duplicates), test blackout, cutoff, capacity, discontinued SKU.
11. Verify event log, actor identity, organisation scope, partial failure rollback and two concurrent requests on same slot.
12. Verify browser on desktop/tablet/mobile and Expo Android on a real device using the secured staging HTTPS API.

## Expo Android UAT APK
The mobile app now defaults to secure mode. Configure `EXPO_PUBLIC_API_URL` to a real **HTTPS** API and `EXPO_PUBLIC_ENABLE_DEMO=false`, then:
```powershell
cd apps\mobile
$env:EXPO_PUBLIC_API_URL='https://YOUR-SECURE-STAGING-API'
$env:EXPO_PUBLIC_ENABLE_DEMO='false'
npx expo install --check
# Local development with Android SDK:
npx expo run:android
# Or EAS internal APK build, subject to free-tier quotas:
npx eas-cli build -p android --profile preview
```
An `eas.json` now defines preview **APK** and production **AAB** profiles. The actual APK **has not** been built, signed or uploaded. Expo/EAS account setup may be required; do not claim a binary exists until verified.

## Hosting before UAT
Cloudflare Pages serves the secure Vite UI, a separate Node host such as Render serves the PostgreSQL API, and Neon holds durable data. Use `NODE_ENV=production` and a unique `JWT_SECRET`, and set exact HTTPS `ALLOWED_ORIGINS` to deployed frontend hostnames. Never publicly host local in-memory API or set `VITE_ENABLE_DEMO=true`. Store backend secrets only in managed environment settings.

**Remaining go-live blockers:** measured builds/coverage, real database integration and concurrency tests, scheduler reliability for recurring orders before cutoffs, password reset/MFA/email notifications, customer price confirmation and accurate cut photos, invoice/GST/settlement/payment workflows, backups/monitoring/retention, and Android UAT APK verification. Do not accept real customer payments/orders until these gates are closed.

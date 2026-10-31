# FreshPrep mobile authenticated pilot

The **same Expo app** now supports two explicitly distinct modes:

1. **Secure pilot (default):** JWT login against PostgreSQL API, one active organisation, server-verified role menus, customer catalogue, one-time ordering, operational work queues, and record-backed operations. Every action goes through an authenticated `/v1/*` route. There is **no demo role switcher** in secure mode.
2. **Local demo (opt-in only):** the older in-memory API with a role switcher, useful for screenshots/UAT simulations. This mode must never be deployed to a real staff/customer release.

## Configure the secure mobile app
```powershell
cd C:\Projects\cut-vegetables\apps\mobile
npm install
$env:EXPO_PUBLIC_API_URL = 'https://YOUR-RENDER-API.onrender.com'
$env:EXPO_PUBLIC_ENABLE_DEMO = 'false'
npm run typecheck
npm test
npx expo install --check
npx expo start --android
```

For Android emulator testing of the **secured PostgreSQL** backend running locally, use `http://10.0.2.2:3001`. Only localhost/loopback emulator targets may use HTTP; all other hostnames require HTTPS.

To intentionally run local demo mode use `EXPO_PUBLIC_ENABLE_DEMO=true`; default is **secure**. The production frontend must never use demo mode.

Use Super Admin or staff account credentials with the organisation UUID returned by the bootstrap command. Mobile keeps the 15-minute JWT in memory only. After restart/expiration, the user signs in again; there is no silent refresh or local password storage.

## Verified roles and screens

- Customer Admin/Buyer: catalogue, own organisation orders, kitchens/slots and one-off order placement. Confirmed orders are stored in PostgreSQL with GPS audit or explicit unavailable-reason.
- Operator/Cutter: consolidated preparation plan, raw-lot IDs, start/complete production batches.
- QC: list pending batches and record inspected pass/fail, findings and temperature.
- Packer: read batches and create pack units only for QC-passed batches, with accurate grams/use-by/label. Order changes to PACKED only after every line meets required quantity.
- Procurement/Store: supplier, purchase, raw-lot and receipt operations with inventory movement and audit.
- Dispatch: driver run, packed order stop assignment.
- Driver: only assigned stops and signed handover; location permission is requested for record creation. Denial saves an unavailable reason, not fake coordinates.
- Admin/Super Admin: live overview on mobile, and fuller staff/customer management through the web secure portal.

**Important:** all backend mutations enforce actor organization and role. The mobile form prompts for existing UUIDs (purchases, lots, batches, stops) to prevent guessing; these IDs can be copied from the read-only queues. Better QR scanning and label printing are not complete.

## Verification/known limitations

- `npm run typecheck` and `npm test` under `apps/mobile` must pass, as must root backend/web checks. The changes are not known to have passed compilation yet.
- Field users need secure HTTPS, a reachable PostgreSQL backend and staff accounts with correct memberships. No APK has been built or verified.
- Active JWTs expire in 15 minutes; refresh tokens, device binding, password recovery, offline queue, push notifications, and per-user rate limits are pending.
- Recurring-order generation and settlement/invoicing are not yet end-to-end certified.
- Mobile workboards are intentionally lean; detailed route maps, QR scanning, lot selection dropdowns, file uploads, image matching and label printing remain enhancements.
- Location must be requested explicitly; no IMEI/serial/device fingerprint collection.

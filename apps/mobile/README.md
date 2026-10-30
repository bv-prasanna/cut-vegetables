# FreshPrep Mobile — one lightweight app, role-specific menus

**Development preview — not authenticated or production-ready.**

This is one Expo React Native app for customer, customer buyer/admin, procurement, store, cutter, operator, supervisor, QC, packer, delivery, dispatch, admin, finance and sales. A visible role switcher changes menu access **only for demonstration**. It does not verify identity or protect APIs. Real role access requires database sessions and server-side RBAC.

## Start on an Android emulator

The mobile app is intentionally kept outside the root npm workspaces to avoid React 18 (web) / React 19 (React Native) dependency conflicts.

```powershell
cd C:\Projects\cut-vegetables
# Terminal 1: local backend, bound to 127.0.0.1:3000
npm run dev

# Terminal 2: Expo mobile package
cd apps\mobile
npm install
npx expo install --check
npm start
```

Press `a` to launch your Android emulator. The app connects to `http://10.0.2.2:3000` by default, the special host-loopback address **inside the Android emulator**. iOS simulator uses `EXPO_PUBLIC_API_URL=http://localhost:3000`.

**Physical phone limitation:** the local API intentionally binds to loopback and has no authentication. Do not make it publicly accessible or forward it to a LAN just to test Expo Go. Before real-device UAT, implement a secured HTTPS staging API, account login and role scoping. Once available, configure `EXPO_PUBLIC_API_URL=https://your-secured-api.example.com`.

## Screens

- Customer/customer buyer/admin: catalogue with prepared cut variants and prices, weight increments, cart, slot selection, one-off demo order and daily/weekday recurring demo schedule.
- Procurement/store: overview, read-only simulated operational queues and inventory placeholders.
- Cutter/operator/supervisor: work-queue preview and production-stage counts. Actual assigned work orders are pending.
- QC/packer: quality and packing stage previews, with no ability to falsely approve a batch.
- Delivery/dispatch: route/work overview; authenticated assignments, GPS proof of delivery and cold-chain tracking are pending.
- Admin/sales/finance: appropriate menu previews, order value derived only from demo records.

When placing a one-off mobile demo order, location is requested with consent. It sends precise coordinates if available or a recorded unavailability reason. The demo API stores the audit event in memory. Do not infer a user’s live location without consent.

## Integration limitations

Local API uses in-memory state and demo roles are NOT authentication. Product photos are generic illustrations; prices are fictitious for UAT only. Database persistence, real operator actions, admin approvals, payment/invoices, offers and loyalty, durable recurrence workers, proper user/kitchen isolation and comprehensive tests remain release blockers. Do not deploy for production.

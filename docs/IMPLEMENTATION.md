# FreshPrep delivery plan and status

## Implemented in this foundational commit
- Strict TypeScript Hono development API and validated variant/slot/recurrence models
- Separate preparation and size variants (numeric and descriptive)
- India-local date cutoff calculations, selected-weekday recurrence matching and quantity validation
- Automated unit tests for slot cutoffs, weekday selection and quantity constraints

## Not implemented yet / not production-ready
- Auth, tenant isolation, role-permission matrix, customer and admin UIs, Expo apps
- PostgreSQL/Drizzle, durable orders, recurring-order generation, scheduling jobs and idempotency
- Slot capacity reservations, geographic delivery zones, blackout dates and cut-off overrides
- Transactional inventory, processing, traceability, QC, packing, route dispatch, proof of delivery
- Customer-specific prices, offers, announcements, hero sliders, loyalty ledger, GST invoicing
- Payments, notifications, image uploads, observability, backups and security testing

The /dev/* endpoints are intentionally named to make the absence of access controls obvious.
Do not expose this server on a public internet host.

## Local start
Requires Node.js >= 20. 
```sh
npm install
npm run test
npm run typecheck
npm run dev
```
API: http://localhost:3000/health

## Implementation milestones
1. DB migrations + tenant auth + RBAC + audit trail.
2. Product master and customer visual catalogue with uploaded variant images.
3. Durable order creation and cutoff/slot capacity atomic booking.
4. Recurrence materialisation with one order per occurrence and idempotency.
5. Procurement, inventory, processing, batch QC, packing and delivery.
6. Commercial prices, offers, promotions, loyalty and invoice ledger.
7. Admin/customer interfaces, automated integration and UAT suites, deployment hardening.

Deployment should be gated on measured CI/local tests, production-safe security, backup/restore drills and operational acceptance.

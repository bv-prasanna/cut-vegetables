# FreshPrep — release readiness (22 November 2026)

## Current gate

**PRIVATE STAGING CANDIDATE ONLY**

- Customer UAT: **NOT CERTIFIED**
- Production release: **NOT READY**
- Current main commit: cb1605187542af15d2fa564cfa6399a98af34ea5
- Latest CI run: 44990780073 — API/Web, PostgreSQL 16, Expo mobile and Chromium jobs all passed (4/4).

## Implemented and CI-verified

- JWT-authenticated PostgreSQL API, one-time Super Admin bootstrap, organisation scoping and role enforcement.
- Customer one-off and recurring ordering, server-side cutoff/slot checks, idempotency and recurrence generation service.
- Procurement/raw lots, production/yield, QC, packing, dispatch, assigned-driver POD and auditable location/unavailable events.
- Secure web operational actions with selection-driven records; server checks permissions and organisation scope.
- Added a protected all-slot daily production summary endpoint with a real PostgreSQL multi-slot aggregation and role-denial test (CI 44990780073, 4/4 passed). The secure web screen still needs to consume and display this summary before the cutter-board UI item can be signed off.
- Expo secure JWT mobile app with role-specific operational actions and selection-based IDs.
- Secure marketing CMS for scheduled hero banners and announcements; public content filters by active publication window.
- GitHub Actions: API/Web typecheck, tests/build; PostgreSQL 16 integration; Expo typecheck/tests; Chromium browser flows.
- Best-effort recurring materializer workflow added; it requires repository secrets and live schedule verification.

## Remaining release blockers

1. **Staging and infrastructure:** no confirmed live staging deployment, production environment verification, monitoring, backup/restore rehearsal or rollback evidence.
2. **Mobile release:** no verified signed Android APK or physical-device UAT. GPS permission, offline/poor network, app restart and session expiry still require field checks.
3. **Commercial data:** real cut-specific photographs, approved prices, zones, cut tolerances, packaging, hygiene/expiry claims and service policies await business sign-off.
4. **Recurring reliability:** configure and verify FRESHPREP_DATABASE_URL and FRESHPREP_PRODUCER_ORG_ID; GitHub scheduled workflows are best-effort, not an SLA. Blocked-occurrence alert escalation remains incomplete.
5. **Commercial modules:** offers/coupons/loyalty and finance/GST/invoices/credit/payments/reconciliation remain incomplete.
6. **Customer engagement:** notifications, support, complaints, shortages, substitutions and returns remain incomplete.
7. **Account lifecycle:** invitations, password reset/recovery, MFA and full account administration remain incomplete.
8. **Operational UAT:** physical receiving, cutting yield, QC quarantine/rework, packing/label scanning, route execution, partial/failed delivery and cold-chain checks need controlled pilot evidence.

## Acceptance rule

All-green CI is evidence of automated code checks, not visual sign-off, regulatory clearance, live deployment, physical device testing or customer acceptance. Do not accept real customer payments or promise production fulfilment until the blockers above are closed and documented.

See 98_PERCENT_COMPLETION_PLAN.md, UAT_AUDIT_2026-11.md, FINAL_UAT_CHECKLIST.md, JWT_DEPLOYMENT.md and RECURRING_ORDERS.md.

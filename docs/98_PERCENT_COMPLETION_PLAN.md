# FreshPrep — 98% module completion plan

**Status date:** 22 November 2026  
**Repository:** bv-prasanna/cut-vegetables  
**Current main commit:** cb1605187542af15d2fa564cfa6399a98af34ea5  
**Latest CI run:** 44990780073 — 4/4 jobs passed  
**Release state:** private staging candidate only; customer UAT is not certified and production is not ready.

## What 98% means

The percentages below are engineering estimates of implemented functionality, not line coverage, test coverage, production uptime, or customer acceptance. A module reaches the 98% target only when:
1. Required BRD/SRS behaviour is implemented in the backend and persistent schema.
2. Web and mobile screens use the real authenticated APIs; no local-demo-only completion paths remain.
3. Tenant scope, RBAC, validation, audit events, idempotency and safe error messages are enforced server-side.
4. Positive, negative, permission, concurrency and real-PostgreSQL integration tests pass; browser/mobile checks cover the relevant flows.
5. No open P0/P1 defect remains for that module.
6. Any required external approval or physical UAT is explicitly signed off. Code completion alone cannot substitute for that approval.

## Current estimated module status

| Module | Backend | Web FE | Mobile FE | Integration | Remaining critical work |
|---|---:|---:|---:|---:|---|
| Platform foundation, tenancy and DB | 90% | 85% | 80% | 90% | Tenant/role edge cases, operational observability, restore rehearsal |
| Authentication and RBAC | 90% | 85% | 85% | 90% | Invitations, password reset, MFA, refresh/session lifecycle |
| Catalogue and SKU master | 85% | 85% | 85% | 85% | Real cut photographs, approved prices, full variant image/admin workflow |
| Customer ordering and checkout | 90% | 85% | 85% | 90% | Order detail/reorder/cancel, quote/discount snapshots, customer UAT |
| Delivery slots, cutoff, zones | 80% | 75% | 70% | 80% | Holiday/blackout admin, capacity by weight/route, exception approvals |
| Recurring orders | 85% | 80% | 80% | 85% | Scheduler secrets and live run verification, blocked-occurrence escalation, holiday rules |
| Admin dashboard and analytics | 85% | 80% | 70% | 85% | Pilot-ledger reconciliation, exception drill-down, report exports |
| Staff and customer management | 80% | 75% | 60% | 80% | Invitations, account edits/deactivation, multi-kitchen onboarding and recovery |
| Procurement and raw inventory | 85% | 75% | 80% | 90% | Supplier grades/costs, receipt reconciliation, purchase approval and stock-count UAT |
| Production and cutting | 90% | 80% | 85% | 90% | Final all-slot daily roll-up, physical yield capture, work allocation and exception recovery |
| Quality control | 90% | 80% | 85% | 90% | Quarantine/rework policy, calibrated checks, physical hygiene/temperature UAT |
| Packing and labels | 90% | 80% | 85% | 90% | Per-order/partial packing, label printing/scanning, expiry/handling policy |
| Dispatch, delivery and POD | 90% | 80% | 85% | 90% | Route optimisation, failed/partial delivery, shortage/return flow, physical GPS/POD UAT |
| Audit and reporting | 75% | 70% | 60% | 75% | Complete event coverage, export/retention, finance/yield/complaint reports |
| Marketing CMS (slides and announcements) | 75% | 75% | 0% | 80% | Edit workflow, audience/zone targeting, approval/publish separation |
| Offers, coupons and loyalty | 15% | 10% | 0% | 10% | Eligibility, stacking, quota concurrency, immutable earn/redeem/reverse ledger |
| Finance, GST, invoices and payments | 40% | 40% | 25% | 75% | GST profile and tax invoice issuance, refunds, gateway/bank reconciliation, aging and finance reports |
| Notifications, support, complaints and returns | 45% | 55% | 40% | 60% | Consent, delivery channels/status, refund execution, substitution approval, return pickup and SLA escalation |
| Deployment, backup and release | 40% | 30% | 20% | 25% | Real staging, secret configuration, signed APK, backup/restore, monitoring and rollback |

**Overall estimate (24 Nov 2026):** core order-to-delivery remains approximately 90% backend, 80% web, 85% mobile and 90% automated integration. Full BRD v3 scope is approximately **68–72%** after the support and finance batches. This is an engineering estimate, not a measured test-coverage score or customer acceptance certificate. The full product is not at 98% yet.

## Work completed in the latest implementation batches

- Added a tenant- and role-protected `/v1/ops/production-summary` API that consolidates daily cutter demand by exact SKU across all delivery slots and returns slot-wise quantities plus production/QC/packing progress. Added a real PostgreSQL integration scenario covering two delivery slots and cross-role denial; CI run 44990780073 passed 4/4.


- Secure web operational actions for supplier creation, purchase orders, raw-lot receipt, batch start/completion, QC, packing, delivery-run creation, stop assignment and driver POD.
- Permission-scoped /v1/ops/action-options selectors. The API returns only the records allowed by the authenticated role and organisation.
- Mobile operations now use selectable suppliers, purchase orders, vegetables, order lines, matching raw lots, batches, drivers, delivery runs and assigned stops instead of asking staff to type UUIDs.
- Secure marketing CMS for scheduled hero banners and announcements, with audit events, HTTPS media validation, archive actions and public active-window filtering.
- Hero banner CTA targets and separate mobile image URLs are supported.
- A best-effort GitHub Actions recurring-order workflow is present. It requires repository secrets FRESHPREP_DATABASE_URL and FRESHPREP_PRODUCER_ORG_ID; actual scheduled execution is not yet verified.
- Customer support cases for quality, shortage, wrong item, late delivery, packaging, billing and return requests: buyer/supplier scoped API, duplicate-active-case prevention, audited lifecycle, customer web/mobile forms and staff web queue. PostgreSQL lifecycle and browser UAT are included.
- Finance foundation: provisional invoice generation from delivered orders, receipt capture with unique references, transactional invoice allocation, draft/approved credit notes, credit-adjusted invoice balances, customer invoice visibility on web/mobile, and finance workspace. GST tax invoice issuance is deliberately disabled pending approved tax/accounting configuration. PostgreSQL tests cover invoice replay, customer scoping, duplicate receipt references, over-allocation and credit notes. CI run 45254741566 passed 4/4.

## Completion sequence

### P0 — finish the physical order-to-delivery journey
1. Reconcile the secure web cutter board with the required daily all-slot item totals and slot-wise breakdown.
2. Complete batch input/output/waste reconciliation and stock movement checks.
3. Complete QC failure quarantine, approved rework/retest and rejection handling.
4. Finish per-order and partial packing, pack-unit traceability and label print/scan integration.
5. Finish route manifests, failed/partial delivery, shortage handling, returns and customer-facing POD.
6. Run two-customer, multi-role and physical floor UAT with actual product, weight and location evidence.

### P1 — customer, account and recurrence reliability
1. Add order detail, reorder, cancellation/exception approval and customer tracking.
2. Add invitation, password recovery, MFA and account deactivation with secure token lifecycle.
3. Configure the recurring workflow secrets and observe scheduled runs before every relevant cutoff. Add alerting/escalation for blocked occurrences.
4. Verify blackout dates, holidays, pause/resume/skip and parallel scheduler retries against real PostgreSQL.

### P1 — commercial and finance modules
1. Implement effective-dated customer contract prices and quote approvals.
2. Implement offers/coupons with quotas, eligibility, stacking rules and concurrency-safe redemption.
3. Implement immutable loyalty ledger with earn, redeem, expiry, reversal and authorised adjustment.
4. Implement invoices, GST configuration, credit notes, receipts, payment allocations and receivables aging only after business/accounting policy approval.

### P1 — engagement, support and operations
1. Complete notification preferences, consent and in-app/email delivery status.
2. Add support cases, complaints, shortage/substitution approval, returns and traceable financial correction.
3. Add supplier quality, cold-chain/temperature records, recall queries and operational reports.
4. Add audit export, retention, structured monitoring and recovery procedures.

## Release gates

- Staging website/API/database configured with HTTPS, exact CORS, managed secrets and real role accounts.
- Migration rehearsal and verified backup/restore.
- Signed Android APK built and tested on physical Android devices; iOS remains a separate release decision.
- Desktop/tablet/mobile visual and accessibility acceptance.
- Real cut-specific photographs, approved price list, service zones, packaging, cut tolerances, hygiene/expiry rules and commercial terms signed off.
- No P0/P1 security or data-integrity defect; 98%+ agreed acceptance scenarios passing.
- Customer UAT sign-off and pilot operational metrics accepted.

## Business decisions still required

The BRD v3 still requires confirmation of launch service zones, cut-size tolerances, prices/effective dates, minimum quantities, substitutions, GST/billing, credit limits/terms, delivery charges, recurrence notice period, holidays/blackouts, promotion stacking, loyalty earn/redemption/expiry and return/dispute timelines. These cannot be safely invented in code.

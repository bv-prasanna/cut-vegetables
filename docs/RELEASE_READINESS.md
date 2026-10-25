# Release-readiness tracker

**Not ready for UAT or production deployment.** This document distinguishes code written from verified behavior.

## Implemented foundations
TypeScript/Hono local development API, visual product-variant UI prototype, slot and recurring schedule domain validation, role-permission policies, PostgreSQL DDL baseline, event geo schema, and isolated business rules for price quoting, admission and recurrence dates.

## Critical gaps
- Proper session authentication and API enforcement of tenant/role/resource isolation
- Persisted services (current app is in-memory); migrations must be tested against PostgreSQL
- Atomic slot reservation and order idempotency in actual transactions
- Recurrence materializer/scheduler with pauses, skips, holidays, retries and status/alerts
- Full procurement, raw lots, waste/yield tracking, production/QC/packing/dispatch/POD
- Marketing CMS, offers/coupons, immutable points ledger and finance workflows
- Full customer app, role-specific operator/admin/driver interfaces
- Automated integration, security and E2E runs with measured coverage; backup/restore drill
- Every business event must emit an auditable geo location or explicit unavailable reason

## Verify locally
```bash
npm install
npm run typecheck
npm test
npm run dev
npm run dev --workspace @freshprep/web
```
Do not report percentage coverage until measured. Never expose the current /dev API to the internet. Keep PR draft until quality gates pass.

# FreshPrep recurring schedules — implementation and operations

## Customer functionality
The secure web customer portal now supports one-off orders, daily or selected-weekday recurring schedules, listing, pausing/resuming/cancelling, and skipping individual future delivery dates. It verifies kitchen ownership, zone/slot compatibility and SKU weight steps on the PostgreSQL API. The customer's JWT and membership are checked for every action.

## Generation of real orders
Recurring schedules do **not** automatically appear in the cutter workboard merely because they are saved. The new generation service converts due schedules into PostgreSQL orders after checking:
- Valid date and weekday, active schedule and producer assignment
- Explicit skipped dates and existing occurrence records (idempotency)
- Active matching delivery slot, blackout date and cutoff in Asia/Kolkata
- Capacity enforced while holding the same PostgreSQL slot row lock as checkout
- Currently active cut variants and min/increment weights
- Immutable per-order price snapshot, slot reservation and audit event

Each occurrence is handled in a separate SQL transaction. Successfully created orders appear in consolidated cutting demand and in customer order history.

The generator records `CREATED`, `BLOCKED`, `SKIPPED`, `EXISTS` or `NOT_DUE`. A blocked order is **not** silently accepted; the operator must review the reason. It will not retry itself without explicit corrective workflow.

## How to run it without a paid cron plan

After migrating the schema, the Super Admin can use the secure web portal:

```text
Sign in → Operations centre → Overview → Recurring order generation
→ select an upcoming delivery date → Generate due orders
```

Alternatively, an operations script can be launched on a trusted machine or scheduler:

```powershell
cd C:\Projects\cut-vegetables
$env:DATABASE_URL = 'postgresql://...'
$env:PRODUCER_ORG_ID = 'your-producer-organisation-uuid'
$env:DELIVERY_DATE = '2026-11-03'
npm run recurrence:run --workspace @freshprep/api
```

**Important:** The backend runs as a free/sleeping web service and therefore cannot guarantee uninterrupted recurring generation on its own. Configure a verified external scheduler before real customer launch. Ensure it runs before **all** delivery cutoffs, including the morning slot's previous-day 11 PM cutoff. Never put database credentials in GitHub Actions workflow files or client-side code. This CLI is not an automatic scheduler.

## QA scenarios
- Two customers' occurrences for the same date, slot and cut size consolidate into one cutter demand line while retaining distinct order IDs for packing.
- Run generator twice: second pass must report EXISTS and create no extra orders, reservations or invoices.
- Date skipped by customer: SKIPPED with no order.
- Past cutoff, blackout, full capacity, SKU removed, invalid weight: BLOCKED with an auditable reason.
- Paused/cancelled schedules: no generation.
- Organisation A cannot see, edit or skip organisation B's schedules.
- Driver/cutter cannot generate orders or create customer schedules.
- After successful materialization: verify `order_items.line_total_paise`, `slot_reservations`, `recurring_occurrences`, `event_log`.
- Parallel generator executions: database row locks and unique occurrence constraints must eliminate duplicates.

**Status:** Code and focused mock-based tests added. Live PostgreSQL migration, concurrency/integration tests, external scheduler and end-to-end customer UAT have **not yet been verified**.

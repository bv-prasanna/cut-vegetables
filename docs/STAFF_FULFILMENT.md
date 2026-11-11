# FreshPrep cutter, packing, QC and delivery workboards

## Why these screens exist
Customer orders must be aggregated for vegetable preparation, while physical packs and deliveries must remain tied to each customer order. One order may contain many preparation variants. A batch may not be packed until QC passes, and an order should not be dispatched until all order-line quantities are packed.

## Role-specific workboards

| Role | Default view | Main actions |
|---|---|---|
| Cutter / Operator | Delivery date → delivery slot → vegetable → preparation → exact size → **total kg** plus number of contributing customer orders | Drill into constituent orders; start production; capture batch input and finished/waste weights |
| Production Supervisor | Consolidated demand and production progress, shortages and raw material allocations | Assign priorities, supervise batches and exceptions |
| QC | Batches awaiting QC, measured output and inspection results | Record pass/reject, inspection notes and temperature |
| Packer | **Individual customer orders** with kitchen, date/slot, each requested variant, requested kg, QC-approved kg, packed kg | Generate pack units, labels, use-by; automatically mark order PACKED only after all lines meet required weights |
| Dispatch | Packed orders, delivery date/slot, assigned driver/run and stops | Build runs, assign stops, record dispatch |
| Driver | Only own assigned runs/stops, destination and receiver | Capture handover, location/permission status and proof of delivery |

## Example: cutter consolidated requirements
For 2 November, 5:00–8:00 delivery:
- Hotel A: potato dice 10 mm, 5 kg
- Restaurant B: potato dice 10 mm, 7 kg
- PG C: onion chop 5 mm, 4 kg

The cutter board shows **Potato / Diced / 10 mm / 12 kg / 2 orders**, and **Onion / Chopped / 5 mm / 4 kg / 1 order**. Potato dice 20 mm, 2–5 PM delivery, and other dates must be separate rows. All board filters are scoped to the signed-in operator organization on the PostgreSQL API.

## Data contract (development preview)
The loopback-only demonstration API supports:
- `GET /dev/staff/production?date=&slotId=` — consolidated demand.
- `GET /dev/staff/packing?date=&slotId=` — order-wise required cuts and weights.
- `GET /dev/staff/delivery?date=&slotId=` — delivery order states.
- `POST /dev/staff/orders/:id/advance` — sequential **demo simulation only**, role string is NOT authenticated. The API prevents skipping QC, packing or dispatch, but no real QC/packing/POD is carried out.
- Web: top navigation **Staff Boards**, with Cutter, QC, Packer, Dispatch, Delivery tabs.
- Expo mobile: role-specific Production / Quality / Packing / Deliveries menus.

## PostgreSQL workboards (secure API prototype)
- `GET /v1/ops/production-plan?date=YYYY-MM-DD&slotId=<uuid>`
- `GET /v1/ops/packing-board?date=YYYY-MM-DD&slotId=<uuid>`
- `GET /v1/ops/delivery-board?date=YYYY-MM-DD&slotId=<uuid>`
- `GET /v1/ops/batches`, `GET /v1/ops/runs`, `GET /v1/ops/summary`
- `POST /v1/ops/batches`, `POST /v1/ops/batches/:id/complete`, `POST /v1/ops/batches/:id/qc`, `POST /v1/ops/batches/:id/pack`
- `POST /v1/ops/runs`, `POST /v1/ops/runs/:id/stops`, `POST /v1/ops/stops/:id/complete`
- Supply: `POST /v1/ops/suppliers`, `POST /v1/ops/purchases`, `POST /v1/ops/purchases/:id/receive`

In production-mode APIs, organization and roles come from a verified session, not from a client role selector. An administrator needs to establish a producer organization and link customer kitchens to that producer for incoming orders to appear in the production board. State mutations write geo-aware audit events within the SQL transaction (location or explicit unavailable reason).

## Status and known limitations
- Development-demo board aggregation + sequenced order stages and unit/API tests have been added.
- Authenticated PostgreSQL query/transaction code exists but **not integrated with the current web/mobile login screens**.
- Physical event processing still needs full authenticated UI workflows, inventory adjustment policies, handling of rejected/partial batches, assigned production operators, packing label printing and customer-specific delivery details.
- Database migrations and PostgreSQL role flows have not been executed or concurrency-tested in the available environment. The app must not be used for real production, payments or order commitments until those gates pass.
- Generic web/Unsplash stock imagery is *not* accurate proof of vegetable preparation dimensions; replace with cut-variant product photography before customer release.

## Local review
Run `npm run typecheck`, `npm test`, `npm run web:test`, `npm run web:build` after pulling. Start the loopback development API on port 3000 and web on port 5173. Add demo orders with dates and different slots from the catalogue, then open **Staff Boards**. In Expo, switch to Cutter/Operator, QC, Packer, Dispatch or Delivery to see their work queue.

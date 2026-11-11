# Event latitude / longitude requirement

Every material business event (login/authentication, product/admin changes, order create/edit/cancel, recurrence generation, inventory movement, production step, QC, packing, dispatch, driver check-in, proof of delivery, payments, credits, offers, loyalty changes and failed attempts) MUST create an auditable event record including a location object.

**Location object:** latitude, longitude, source, accuracy (where available), device capture timestamp, consent status, unavailable reason, and server event timestamp. Do not falsely imply GPS availability for backend scheduler/system tasks: source SYSTEM with explicit reason. For browser/mobile action, request location permission appropriately, use a bounded timeout and record UNAVAILABLE and reason if denied/timed out/offline. Never fabricate GPS; do not substitute the customer kitchen address silently. If address geocoding is used, label ADDRESS_GEOCODE.

**Privacy and controls:** disclose purpose, obtain appropriate notice/consent, minimize precise locations, restrict location detail to authorized staff, configure retention and deletion policies, encrypt transport/storage, and prohibit covert/background collection. Do not block critical user actions solely because permission is denied unless a reviewed business requirement genuinely needs precise delivery verification.

**Architecture:** generate events inside the same DB transaction as state changes where feasible, with unique idempotency keys and a dedicated event_log table. Bind actor and organization from authenticated session, NEVER accept them as trusted client parameters. Client-captured coordinates are unverified claims unless corroborated; event timestamps on server are authoritative. Drivers' delivery confirmation may require stricter proximity checks with manual supervisor override and reason. Location is not guaranteed trustworthy and must not be used as sole fraud proof.

**Status:** migration + validation model + unit tests added. Instrumenting actual production workflows and enforcing audit events is **still pending**; current in-memory development endpoints are not secured.

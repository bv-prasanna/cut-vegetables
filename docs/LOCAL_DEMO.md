# Local customer/admin preview
Run with Node 20+:
```bash
npm install
npm run test
npm run typecheck
npm run dev
npm run dev --workspace @freshprep/web
```
Then open http://127.0.0.1:5173 (the API is loopback-bound on port 3000).
Use **Admin Demo** to create a vegetable variant and delivery slot, then use **Shop** to select photo-based variants, quantities and book a demo order. Use **Recurring Orders** for daily or selected weekday schedules.

**This is not deployable or production-ready.** The API uses in-memory storage (restart clears data), routes under /dev are unauthenticated, single-instance capacity checks are non-transactional, recurring schedules are saved but not automatically materialized. No real delivery, billing, loyalty, inventory, operator permissions or production workflow is wired. The web UI is a working local prototype, not the final mobile app. Never bind the demo to a public interface.

Full persistent architecture and business requirements remain in docs/BRD_v3.md, docs/SRS_v3.md, and migrations.

# Local dev networking and CORS fix

Use two terminals after checkout:

```bash
npm install
npm run dev
# second terminal
npm run dev --workspace @freshprep/web
```

Open http://127.0.0.1:5173 (or http://localhost:5173). Vite proxies `/api/*` requests to the local Hono backend at `http://127.0.0.1:3000`, removing browser cross-origin requests in development.

Diagnostics:
1. Open http://127.0.0.1:3000/health; expect `{"status":"ok","mode":"LOCAL_DEVELOPMENT_ONLY"}`.
2. Open http://127.0.0.1:5173/api/catalog/variants; expect `[]` on a fresh server.
3. If the API is down, Vite will return a proxy error (usually HTTP 500), and the frontend will show an actionable error.
4. If Vite chooses another port because 5173 is occupied, the proxy still works.

Security: API remains bound to loopback; no production authentication or persistence exists. Do not deploy the prototype publicly.

# FreshPrep — JWT authentication, Super Admin bootstrap & zero-cost-first deployment

## 1. What is now implemented

- PostgreSQL-backed, signed **HS256 JWT** access tokens (15-minute lifetime), validated with `jose` and an explicitly configured `JWT_SECRET` of at least 32 random bytes.
- Each token contains `sub`, `org`, `jti`, `iss`, `aud`, `iat`, `nbf`, `exp`; organization membership and active roles are rechecked from PostgreSQL for **every** protected request. The bearer token itself cannot confer a role.
- The database stores only the SHA-256 digest of `jti`, not raw bearer tokens; logout revokes that session immediately. Expires after 15 minutes; user signs in again; refresh tokens are **not** implemented.
- Database-backed login throttling: after eight unsuccessful attempts in a 15-minute window, the corresponding email/organization pair is blocked for 15 minutes. A successful login resets failed attempts.
- One-time CLI Super Admin bootstrap: password hashed with salted scrypt; advisory transaction lock serializes concurrent bootstrap attempts; refuses an existing SUPERADMIN globally. **No HTTP bootstrap endpoint.**
- Permission-checked REST endpoints to create staff accounts, assign permitted roles, onboard customer kitchens and review organisation-scoped metrics.
- Secure web sign-in portal with JWT kept **in memory only** (not localStorage), and admin role management plus read-only PostgreSQL-backed cutting/packing/delivery workboards.
- Published frontend defaults to blocking the old unauthenticated `/dev/*` screens. The demo API remains loopback-only and must NOT be hosted on Render/Cloudflare.
- Authenticated operational state transitions and staff workboard API foundations already exist, but production UAT must still verify them against PostgreSQL.

## 2. Recommended pilot architecture (no required monthly subscription)

```
User browser / Android
    |
    | HTTPS
    v
Cloudflare Pages (React/Vite static UI)
    |
    | HTTPS + JWT Authorization header
    v
Render free Node.js web service (Hono API / PostgreSQL)
    |
    | TLS PostgreSQL connection
    v
Neon Free Postgres (migrations 0001..0008)

Local Windows developer machine:
    migration CLI and one-time Super Admin bootstrap
```

Use **Cloudflare Pages** for the Vite site, **Render free Web Service** for the Node/TS API, **Neon Free** for the persistent database. Do not use Render's 30-day ephemeral Free PostgreSQL as your permanent data store; current free offerings/limits can change. Render free Node services spin down after ~15 minutes idle and can cold-start slowly. This is suitable for **staging/pilot**, not an SLA-backed business launch. Cloudflare Workers + Hyperdrive is a future option but this Node server has not been ported to Workers runtime.

## 3. First local backend setup (PowerShell)

Use Node 22+. Pull the branch:

```powershell
cd C:\Projects\cut-vegetables
git checkout feat/typescript-platform-foundation
git pull origin feat/typescript-platform-foundation
npm install
npm run typecheck
npm test
npm run web:test
npm run web:build
```

Create Neon Postgres through the provider dashboard and copy its **pooled/unpooled TLS DATABASE_URL** (for CLI migrations choose the appropriate direct connection if required). Keep database URLs and passwords in local environment settings/secrets — never commit them or paste them into chat/logs.

Generate a **48-byte secret** using PowerShell:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($bytes)
```

Set `DATABASE_URL`, `ALLOWED_ORIGINS`, and the one-time bootstrap variables in your local shell:

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173'
$env:BOOTSTRAP_ORG = 'FreshPrep Veggies'
$env:BOOTSTRAP_EMAIL = 'your-superadmin-email@your-domain.com'
$env:BOOTSTRAP_PASSWORD = 'a-unique-strong-secret-password'
npm run db:migrate --workspace @freshprep/api
npm run db:bootstrap --workspace @freshprep/api
```

Save the printed `organizationId`; login uses email + password + this organisation UUID. **Immediately clear** the CLI-only variables when finished:

```powershell
Remove-Item Env:BOOTSTRAP_PASSWORD,Env:BOOTSTRAP_EMAIL,Env:BOOTSTRAP_ORG
```

If a Super Admin already exists, the bootstrap command rejects subsequent executions. It must not be enabled as a public HTTP endpoint. For local development start the real API:

```powershell
npm run dev:pg --workspace @freshprep/api
```

Port 3001 by default. Test manually:

```powershell
$body = @{email='your-superadmin-email@your-domain.com';password='your-password';organizationId='your-printed-uuid'} | ConvertTo-Json
$auth = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/auth/login -ContentType application/json -Body $body
$auth.tokenType
Invoke-RestMethod -Uri http://127.0.0.1:3001/v1/me -Headers @{ Authorization = 'Bearer ' + $auth.accessToken }
```

For web local testing with secure API, build the secure portal using the correct `VITE_API_BASE_URL` environment variable, or configure the Vite proxy to target port 3001 instead of the port 3000 demo API.

## 4. Deploy the Node API to Render free

Use `render.yaml` in the repository or configure a Web Service manually:
- Repository `bv-prasanna/cut-vegetables`, branch `feat/typescript-platform-foundation`.
- Root: repository root.
- Build: `npm install --include=dev --no-audit --no-fund && npm run typecheck`.
- Start: `npm run api:prod`.
- Health: `/health`.
- Environment: `NODE_ENV=production`, `HOST=0.0.0.0`, `DATABASE_URL=<Neon TLS URL>`, `JWT_SECRET=<generated secret>`, `ALLOWED_ORIGINS=https://<your-pages-project>.pages.dev`.

**Never** store BOOTSTRAP_PASSWORD on the deployed service. Run migrations and CLI bootstrap from your trusted local machine. Use Render **Secret / Environment** controls for private values. This repository change does **not** create resources in your Render or Neon account.

After deployment, check HTTPS `/health`, POST `/auth/login`, GET `/v1/me` with Bearer and GET `/v1/admin/overview` as SUPERADMIN. Check a revoked token fails. Explicitly verify that `/dev/admin/dashboard` and the local seed endpoints are NOT reachable.

## 5. Deploy React site to Cloudflare Pages

- Connect the same repository to Cloudflare Pages.
- Branch: preview on `feat/typescript-platform-foundation`, production branch later when verified.
- **Root directory:** repository root.
- Build: `npm install --include=dev --no-audit --no-fund && npm run web:build`.
- Output directory: `apps/web/dist`.
- Build environment: `VITE_API_BASE_URL=https://your-actual-render-service.onrender.com`; `VITE_ENABLE_DEMO=false`; Node 22.
- In Render's `ALLOWED_ORIGINS`, include exactly the real HTTPS origin of the Pages deployment, plus your custom domain if any. Do not use wildcard CORS.
- The public homepage remains visible; “Sign in / Get Started” opens a JWT sign-in form. Unprotected demo staff screens are hidden in published builds.

`VITE_API_BASE_URL` is a **public** address, not a secret. JWT_SECRET, BOOTSTRAP_PASSWORD and DATABASE_URL must **never** be prefixed with `VITE_` or committed.

## 6. Security/UAT blockers before public launch

- Tests and production runtime **have not yet been executed in a connected deployment**. Measure passing backend, web, mobile and database integration tests and coverage before launch.
- Current authenticated web operations views are primarily **read-only**. Real cutting/packing/delivery writes exist in API prototypes but do not yet have fully integrated secure UI, approvals or E2E tests.
- New account bootstrap is one-time and currently does not implement password reset, MFA or account invitation email. Add before customer rollout.
- Login throttle is email/organization-based, not IP-aware; operationally review lockouts and rate-limit policy before production use.
- Passwords entered in web admin are sent over HTTPS to the API (never over HTTP in production); handle issuance via secure channels.
- Expo mobile still uses local demo role switching. A secure token-aware mobile login and assigned-task interface is required before field operation.
- No durable recurrence materializer, end-to-end procurement-to-invoice or payment workflow has been certified.
- The sample products have illustrative images/prices only.

The platform should be treated as a **private pilot/staging environment**, not production-ready until these blockers are closed.

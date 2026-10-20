# 9. Development

## Prerequisites

- Go ≥ 1.22, Node ≥ 20, `make`.
- [`golang-migrate`](https://github.com/golang-migrate/migrate) CLI
  (`migrate`) to run migrations.
- `psql` (optional) to inspect the database.
- Access to the Supabase project (there is no local Postgres setup; local
  development uses the same Supabase project). Ask the project owner for the
  credentials.

## Environment variables

### Backend (`backend/.env`, template in `backend/.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | **required** | Postgres URL. In production, the transaction pooler (`:6543`). |
| `JWT_ISSUER` | **required** | `https://<ref>.supabase.co/auth/v1`. Also the source of the Supabase origin used for image URL validation and the Admin API. |
| `JWKS_URL` | **required** | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `HTTP_ADDR` | `:8080` (or `:$PORT`) | Listen address |
| `DB_MAX_CONNS` / `DB_MIN_CONNS` | 8 / 0 | Pool size per process. `maxParallelQueries` (3) assumes 8 |
| `DB_MAX_CONN_LIFETIME` / `DB_MAX_CONN_IDLE_TIME` | 30m / 5m | Connection recycling |
| `JWKS_CACHE_TTL` | 10m | JWKS cache |
| `RATE_LIMIT_REQUESTS` / `RATE_LIMIT_WINDOW` | 120 / 1m | Per-IP limit |
| `WRITE_RATE_LIMIT_REQUESTS` | 30 | Writes per user per window |
| `PRAYED_WINDOW_HOURS` | 12 | Dedupe window for identical reactions |
| `CORS_ALLOWED_ORIGINS` | localhost/127.0.0.1 on 5173 and 5174 | Comma-separated. Only matters in dev (same origin in production) |
| `BIBLE_API_BASE_URL` | `https://bible-api.com` | Bible text provider |
| `BIBLE_API_TIMEOUT` | 3s | Provider timeout |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Admin API key, used only by account deletion. Empty → `DELETE /me` answers 503 |
| `PRAYED_IP_BURST_PER_HOUR` | 200 | ⚠️ Read by `config.go` but not used anywhere |
| `BIBLE_TRANSLATION` | `almeida` | ⚠️ Read but not used; the translation comes from `bible_verses.translation` |

The `DATABASE_URL` in `.env` includes `default_query_exec_mode`, a pgx-only
parameter. `migrate` and the app accept it; `psql` rejects the whole URL with
"invalid URI query parameter". Strip it first:

```bash
cd backend
set -a && source .env && set +a
PSQL_URL=$(echo "$DATABASE_URL" | sed -E 's/[?&]default_query_exec_mode=[^&]*//')
psql "$PSQL_URL" -c "select version from schema_migrations;"
```

### Frontend (`frontend/.env`, template in `frontend/.env.example`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080/api/v1` in dev, `/_/backend/api/v1` in production. Optional: `lib/api.ts` infers it |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (never the service role key) |
| `VITE_TURNSTILE_SITE_KEY` | Captcha site key. Empty in dev hides the widget |

`VITE_*` values are baked into the bundle at build time and are public.

## Running

```bash
make dev
```

Starts the backend on `:8080` (`go run ./cmd/api` with `backend/.env` loaded)
and Vite on `:5173`. `Ctrl+C` stops both (`trap 'kill 0' SIGINT`).

Without `make`, in two terminals:

```bash
cd backend && set -a && source .env && set +a && go run ./cmd/api
cd frontend && npm install && npm run dev
```

Useful URLs:

- App: http://localhost:5173
- Health: http://localhost:8080/health
- Swagger UI: http://localhost:8080/docs

Production equivalents: `https://www.creo.com.br` and
`https://www.creo.com.br/_/backend/docs`.

## Migrations

```bash
cd backend
set -a && source .env && set +a
migrate -path internal/db/migrations -database "$DATABASE_URL" up
migrate -path internal/db/migrations -database "$DATABASE_URL" version
migrate -path internal/db/migrations -database "$DATABASE_URL" down 1
```

For production, `DEPLOY.md` recommends the **direct** connection (`:5432`)
instead of the pooler. There is a single Supabase project, so local `up` changes
production: write migrations carefully and keep the `.down.sql` correct.

Checklist for a new migration: [03-database.md](03-database.md#adding-a-migration).

⚠️ Recreating a database from scratch currently breaks moderation (see
[03-database.md](03-database.md#legacy-and-divergences)).

## Checking your work

There are no tests and no CI. Before calling a change done:

```bash
cd backend && go build ./...
cd frontend && npx tsc -b --noEmit
```

Both print nothing and exit 0 when they pass. Also:

- Changed an endpoint? Update `openapi.yaml` and lint it:
  `npx @redocly/cli lint backend/internal/http/apidocs/openapi.yaml`
  (warnings about `operationId` and tag descriptions are expected).
- Touched a query path? Watch `dbRoundTrips` in the backend log, or the
  `Server-Timing` header in DevTools, before and after.
- Changed UI? Check it at ≤ 900 px too (see [05-frontend.md](05-frontend.md#mobile--900-px)).
- New dynamic route? Add it to `DYNAMIC_ROUTES` in `lib/analytics.ts`.

`npm run build` runs `tsc -b && vite build`, the same as Vercel.

## Common problems

**`bind: address already in use` on 8080.** `go run` leaves the compiled binary
running after `make` or `go` is killed. Free the port and restart:

```bash
lsof -ti:8080 | xargs -I{} kill -9 {}
pkill -f "node.*vite" 2>/dev/null
make dev
```

Restart the backend after adding routes; Vite reloads the frontend on its own.

**Every login fails with a captcha error.** Supabase has captcha enabled and
the frontend has no `VITE_TURNSTILE_SITE_KEY`. Set the key (or disable captcha
in the Supabase dashboard for local testing).

**Email links open production.** Supabase builds links from its `Site URL`
(`DEPLOY.md §1`). The session is created there; sign in again on localhost.

**"'text/html' is not a valid JavaScript MIME type" after a deploy.** A tab
opened before the deploy asks for old chunk names. `lazyPage` in
`app/router.tsx` reloads once automatically; if it persists, the build is
broken.

**Verse of the day shows only the reference.** The bible-api.com lookup failed
or the translation lacks that verse. Expected degradation; check the backend
log for `daily verse text unavailable`.

**An endpoint returns 500 for a bad id.** The path parameter is missing from
`uuidParamNames` in `middleware/uuid_params.go`.

## Deploying

Push to `main`; Vercel builds both services. Full setup (environment variables
per service, Supabase configuration, Resend, Turnstile, rollback) is in
`DEPLOY.md`. After a deploy, check:

- `GET https://www.creo.com.br/_/backend/health`
- the `x-vercel-id` header ends in `::pdx1::...` for API calls;
- `Server-Timing` on an API call shows a small `db` time and the expected
  number of round trips.

## Commit conventions

Conventional Commits with project scopes (`db`, `groups`, `auth`, `landing`,
`frontend`, `deploy`, `infra`), one concern per commit, migrations and docs in
their own commits. Full rules in `CLAUDE.md §5`.

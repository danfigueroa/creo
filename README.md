# Creo

Creo is a prayer social platform for faith communities (Catholic and evangelical alike), focused on prayer requests, friendship connections, groups, and safe moderation workflows.

## Product Direction

Creo combines social graph and community feeds with prayer-specific privacy and moderation:
- Home feed centered on friends and group content
- Public feed as secondary discovery surface
- Group ownership and join approval flow
- Prayer interactions with anti-abuse controls

## Stack

- Backend: Go, chi, pgx, handwritten SQL
- Frontend: React, TypeScript, Vite, React Query, Tailwind
- Database and Auth: Supabase Postgres + Supabase Auth
- Migrations: golang-migrate

## API Docs

Interactive Swagger UI with every endpoint, request/response schemas and a
guide for getting a test token (use **Authorize**, then **Try it out**):

- Production: https://www.creo.com.br/_/backend/docs
- Local (`make dev`): http://localhost:8080/docs
- OpenAPI spec: [`backend/internal/http/apidocs/openapi.yaml`](backend/internal/http/apidocs/openapi.yaml)

## Repository Structure

- `backend/cmd/api`
- `backend/internal/config`
- `backend/internal/http`
- `backend/internal/services`
- `backend/internal/repositories`
- `backend/internal/models`
- `backend/internal/auth`
- `backend/internal/db/migrations`
- `frontend/src/app`
- `frontend/src/pages`
- `frontend/src/components`
- `docs/product-spec.md`

## Implementation Status

### Implemented

- Backend layered architecture: handlers -> services -> repositories
- Supabase JWT validation with JWKS cache
- HTTP middlewares:
  - request id
  - structured logging
  - auth required/optional
  - CORS for local frontend origins
  - IP rate limiting
- API reference: hand-written OpenAPI spec + Swagger UI at `/docs` (see [API Docs](#api-docs))
- User profile API with unique username support
- Auth user auto-sync from Supabase token to internal `users` table
- Feed endpoints:
  - `GET /api/v1/feed/public`
  - `GET /api/v1/feed/home`
  - `GET /api/v1/feed/groups`
  - `GET /api/v1/feed/friends`
- Prayer requests:
  - `POST /api/v1/requests`
  - `POST /api/v1/requests/{id}/pray`
  - validation for category, visibility, and group membership checks
- Groups:
  - `GET /api/v1/groups`
  - `POST /api/v1/groups`
  - `POST /api/v1/groups/{id}/join-requests`
  - `GET /api/v1/groups/{id}/join-requests`
  - `POST /api/v1/groups/{id}/join-requests/{requestId}/approve`
- Friends:
  - `GET /api/v1/friends`
  - `GET /api/v1/friends/requests`
  - `POST /api/v1/friends/requests`
  - `POST /api/v1/friends/requests/{requestId}/accept`
  - `GET /api/v1/users/search`
  - username-first friend request flow (`@username`)
- Moderation:
  - `GET /api/v1/moderation/queue` + approve / reject / request-changes with audit log (`moderation_actions`)
  - moderation history per request, author notifications on every action
- Notifications (in-app):
  - `GET /api/v1/notifications`, `/unread-count`, `POST /{id}/read`, `/read-all`
  - events: prayed, friend request received/accepted, group join requested/approved,
    request approved/rejected/changes-asked/updated/answered, group announcement,
    prayed/created milestones and prayer streaks
- Prayer request lifecycle: edit, soft-delete, author updates, answered with testimony
- User blocks (`/api/v1/blocks`) affecting feeds and profiles
- Group announcements (CRUD + feed overlay + member fan-out notification)
- i18n (pt-BR / en) with per-user language persisted in the backend
- Frontend:
  - Supabase auth page with sign in, sign up, passwordless, reset password
  - protected routes and logout flow
  - editorial cream/teal UI system across all pages
  - pages: feed, groups, group detail, friends, profile, public profile, request detail, notifications, moderation, auth
  - optimistic "Eu orei" reactions with per-tradition action sets
- Database migrations: `000001`–`000017` (see `backend/internal/db/migrations/`)

### Partially Implemented

- Moderation `remove` action exists in the service layer but has no HTTP route; `ban` has schema (`bans` table) but no implementation

### Not Implemented Yet

- Email notifications (`sent_email_at` column exists, never written)
- Comment system
- Prayer request search (`/users/search` and `/groups/search` exist; requests do not)
- Group invites for `INVITE_ONLY` groups (policy enforced, invite flow missing)
- Data export / account deletion (LGPD)
- Automated deployment and infra environments
- Full automated test coverage (unit/integration/e2e)

## Phase Plan And Updated Checklist

## Phase 0 Setup

Status: `DONE`

Scope completed:
- Monorepo setup with backend and frontend
- Core architecture and project structure
- Supabase integration baseline
- Migration flow and local run scripts
- CI baseline for backend tests and frontend build

What remains:
- Add lint jobs for Go and frontend in CI
- Add migration drift/check job in CI
- Add deploy preview checks

Prompt for next Phase 0 hardening:
```text
Harden Phase 0 CI: add Go lint, frontend lint, migration check, and fail-fast workflow gates. Keep existing architecture and do not introduce new frameworks.
```

## Phase 1 MVP

Status: `IN PROGRESS`

Implemented in Phase 1:
- Auth UI and session handling
- Profile update flow with username
- Group creation and join request approvals
- Prayer creation and prayed interaction with anti-abuse window
- Friends model and username-based request flow
- Home/groups/friends/public feed separation

Pending in Phase 1:
- Complete moderation queue behavior and state transitions
- Add robust error telemetry and user-facing feedback standardization
- Add integration tests for profile/group/request/friend flows
- Add end-to-end smoke tests for main flows

Prompt for remaining Phase 1:
```text
Complete Phase 1 MVP by implementing moderation state transitions and integration tests for profile, groups, requests, and friendships. Keep REST endpoints simple, preserve current schema, and focus on production-safe validation and authorization.
```

## Phase 2 v1

Status: `PLANNED`

Scope:
- Mandatory moderation for all public requests
- Moderator dashboard actions with audit logs
- Notifications (email + in-app records)
- Feed search and pagination

Key backlog:
- `POST /api/v1/moderation/queue/{id}/approve`
- `POST /api/v1/moderation/queue/{id}/reject`
- `POST /api/v1/moderation/queue/{id}/request-changes`
- `POST /api/v1/requests/{id}/remove`
- `POST /api/v1/groups/{id}/bans`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/{id}/read`

Prompt for Phase 2:
```text
Implement Phase 2 moderation and notifications end-to-end. Add moderator actions with audit logging, expose notification APIs, and deliver searchable paginated feeds while preserving current layered architecture.
```

## Phase 3 v2

Status: `PLANNED`

Scope:
- Moderated comments on requests
- Advanced privacy controls
- Group analytics dashboard
- Data export and account deletion flows

Prompt for Phase 3:
```text
Implement Phase 3 growth features: moderated comments, advanced privacy settings, group analytics, and compliance-friendly export/deletion flows with clear authorization and audit trails.
```

## Environment Setup

## Backend

1. Copy env template:

```bash
cp backend/.env.example backend/.env
```

2. Configure `backend/.env`:

- `HTTP_ADDR`
- `DATABASE_URL`
- `JWT_ISSUER`
- `JWKS_URL`
- `JWKS_CACHE_TTL`
- `RATE_LIMIT_REQUESTS`
- `RATE_LIMIT_WINDOW`
- `PRAYED_WINDOW_HOURS`
- `PRAYED_IP_BURST_PER_HOUR`
- `CORS_ALLOWED_ORIGINS`

Required:
- `DATABASE_URL`
- `JWT_ISSUER`
- `JWKS_URL`

## Frontend

1. Copy env template:

```bash
cp frontend/.env.example frontend/.env
```

2. Configure `frontend/.env`:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Run Locally

Sobe **backend (`:8080`) e frontend (`:5173`) ao mesmo tempo** com um único comando, a partir da raiz:

```bash
make dev
```

O alvo carrega `backend/.env`, roda `go run ./cmd/api` em paralelo com `npm run dev` (Vite) no frontend e derruba os dois com `Ctrl+C`.

Pré-requisitos: `make`, Go ≥ 1.22, Node ≥ 20, `backend/.env` e `frontend/.env` preenchidos (ver seções acima).

Se preferir rodar sem `make`, em dois terminais:

```bash
# terminal 1
cd backend && set -a && source .env && set +a && go run ./cmd/api

# terminal 2
cd frontend && npm run dev
```

## Migrations

```bash
cd backend
set -a && source .env && set +a
migrate -path internal/db/migrations -database "$DATABASE_URL" up
```

## Build And Test

Backend:

```bash
cd backend
GOCACHE=/tmp/go-build go test ./...
```

Frontend:

```bash
cd frontend
npm run build
```

## Error Contract

```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "English message",
    "details": {}
  }
}
```

## Product Specification

See:
- `docs/product-spec.md`

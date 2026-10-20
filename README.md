# Creo

Creo is a prayer social network for Catholic and Evangelical communities.
People post prayer intentions with fine-grained privacy (public, group only,
private, anonymous), friends and group members respond with prayer reactions,
and authors share updates and testimonies when a prayer is answered. Around
that: groups with roles and moderation, group announcements, friends by
`@username`, in-app notifications and a daily Bible verse.

Production: https://www.creo.com.br

## Stack

- **Backend**: Go, chi, pgx, hand-written SQL
- **Frontend**: React 18, TypeScript, Vite, TanStack Query, Zustand, Tailwind
- **Database, auth, storage**: Supabase (Postgres, Auth, Storage)
- **Migrations**: golang-migrate
- **Deploy**: Vercel, one project serving the SPA and the Go API

## Quick start

Prerequisites: Go ≥ 1.22, Node ≥ 20, `make`, access to the Supabase project.

```bash
cp backend/.env.example backend/.env     # fill DATABASE_URL, JWT_ISSUER, JWKS_URL
cp frontend/.env.example frontend/.env   # fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
cd frontend && npm install && cd ..
make dev                                 # backend :8080 + frontend :5173
```

Before calling a change done (there is no test suite yet):

```bash
cd backend && go build ./...
cd frontend && npx tsc -b --noEmit
```

Every environment variable, migrations and common problems are covered in
[docs/technical/09-development.md](docs/technical/09-development.md).

## Documentation

| What | Where |
|---|---|
| How the system is built and why: architecture, database, backend and frontend patterns, business rules, security, decision log | [docs/technical/](docs/technical/README.md) |
| API reference (Swagger UI, with a guide to get a test token) | Production: https://www.creo.com.br/_/backend/docs · Local: http://localhost:8080/docs · Spec: [`openapi.yaml`](backend/internal/http/apidocs/openapi.yaml) |
| Deploy (Vercel, Supabase, email, captcha) | [DEPLOY.md](DEPLOY.md) |
| Order to turn on security settings in the dashboards | [SETUP-SEGURANCA.md](SETUP-SEGURANCA.md) |
| Conventions for AI agents working in this repo (Portuguese) | [CLAUDE.md](CLAUDE.md) |

## Repository layout

```
backend/    Go API: cmd/api (entrypoint), internal/{http,services,repositories,models,db,...}
frontend/   React SPA: src/{app,pages,components,state,lib,locales}
supabase/   Email templates for Supabase Auth
docs/       Technical documentation (docs/technical)
```

## License

[MIT](LICENSE)

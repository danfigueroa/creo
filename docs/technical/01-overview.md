# 1. Overview

## The product

**Creo** (formerly Paróquia Viva; the Go module is still called
`parish-viva/backend`) is a prayer social network for Catholic and Evangelical
communities. A person posts an **intention** (prayer request) and chooses who
can see it. Friends and group members respond with **prayer reactions** ("Ave
Maria", "Orei" / "I prayed", "Jejum" / "Fasting"…). The author can see who
prayed, post updates and, once the prayer is answered, mark it as **"graça
alcançada"** (grace received) with a testimony.

Around that there are groups (parish ministries, cells) with roles and
moderation, group announcements, a friends network by `@username`, in-app
notifications and the **verse of the day**, which can be shared to the feed.

The UI is in Brazilian Portuguese, with English and Spanish translations via
i18next. Code identifiers, JSON keys, enums and error codes are in English.

Current scale: dozens of users and a few dozen rows per table (in October 2026,
`users` had 24 rows and `prayer_requests` had 6). This explains several
performance decisions: today the cost is in the network, not in the database
(see [10-performance.md](10-performance.md)).

## Glossary

| Term (UI) | In the code | What it is |
|---|---|---|
| Intenção, pedido de oração (intention, prayer request) | `prayer_requests`, `PrayerRequest` | The main post. Title 3–120 chars, body 10–4000, category, visibility and an anonymity flag. |
| Visibility | `prayer_visibility`: `PUBLIC`, `GROUP_ONLY`, `PRIVATE` | Who can see the request. `GROUP_ONLY` requires at least one group; `PRIVATE` accepts none. |
| Anonymous | `allow_anonymous` | A flag **independent** of visibility: others see the request without an author. |
| Tradition | `tradition`: `CATHOLIC`, `EVANGELICAL` | Every user has one, and every piece of content stores the author's tradition at creation time. Feeds only show content from the reader's tradition. |
| Prayer reaction | `prayer_actions.action_type` | "I prayed for you". The type depends on tradition: Catholic has `HAIL_MARY`, `OUR_FATHER`, `GLORY_BE`, `ROSARY_DECADE`, `ROSARY_FULL`; Evangelical has `I_PRAYED`, `INTERCESSION`, `FASTING`, `GRATITUDE`, `CRYING_OUT`, `PURPOSE`. |
| "Quem rezou" (who prayed) | `GET /requests/{id}/actions` | List of reactions with who made each one. |
| Author update | `prayer_request_updates` | Short text (1–2000 chars) the author posts later; notifies everyone who prayed. |
| "Graça alcançada", answered | `answered_at`, `testimony` | The author marks the request as answered, optionally with a testimony. |
| Group | `groups` | A ministry, cell or community, with a join policy and moderation. |
| Join policy | `group_join_policy`: `OPEN`, `REQUEST`, `INVITE_ONLY` | Join directly, ask and wait for an admin, or invite only. |
| Role | `group_role`: `ADMIN` > `MODERATOR` > `MEMBER` | Hierarchy inside a group (`RoleRank` = 3, 2, 1). |
| Announcement ("aviso") | `group_announcements` | Admin or moderator post on the group wall, with an event date and an optional image. |
| Wall ("mural") | `GET /groups/{id}/feed` | The group feed: requests + announcements + shared verses. |
| Verse of the day | `bible_verses`, `GET /verses/today` | A verse picked deterministically per (user, day) from a curated catalog. |
| Verse share | `verse_shares` | The verse of the day posted to the feed with a comment. The third feed item type. |
| Milestone | `MILESTONE_*` | Celebration notification: 10/50/100/500/1000 reactions given, 1/10/50/100 intentions created, a 7/30/100/365-day prayer streak. |
| Block | `user_blocks` | Hides content in both directions and removes the friendship. |

## Repository map

```
backend/                      Go API (module parish-viva/backend)
  cmd/api/main.go             bootstrap: config, pgx pool, tracer, wiring, HTTP server
  internal/
    auth/jwks.go              Supabase JWT validation (cached JWKS)
    bible/bible.go            bible text lookup (bible-api.com) behind an interface
    config/config.go          environment variables with defaults
    db/
      trace.go                per-request round-trip counter
      migrations/             golang-migrate: NNNNNN_name.up.sql / .down.sql
    http/
      router.go               every chi route in a single block
      middleware/             request id, logging, CORS, auth, body limit, rate limit...
      handlers/               one file per resource; map errors to HTTP
      shared/                 WriteJSON / WriteError (error envelope)
      apidocs/                openapi.yaml + embedded Swagger UI (go:embed)
    models/models.go          every struct and enum
    repositories/
      repository.go           all SQL (interface at the top, ~4000 lines)
      account.go              account export and deletion (LGPD)
    services/service.go       validation, rules, sentinel errors (~1700 lines)
    supabaseadmin/admin.go    Supabase Admin API (account deletion only)
  vercel.json                 regions: ignored by the current deploy (see 02)
  Dockerfile, fly.toml        legacy; unused
frontend/                     React 18 + Vite + TypeScript SPA
  src/
    app/                      router, route guards, providers
    pages/                    one page per route
    components/               shell, feed cards, modals, landing/
    state/                    Zustand stores (session, composer, verse composer)
    lib/                      api (axios), supabase, traditions, i18n, analytics...
    locales/                  pt-BR.json, en.json, es.json
    index.css                 design tokens and design-system classes
  vercel.json                 SPA rewrite, caching and security headers (CSP)
supabase/templates/           Supabase Auth email HTML (pasted into the dashboard)
docs/                         this folder and older docs
vercel.json                   root: experimentalServices (frontend + backend)
Makefile                      make dev: runs backend and frontend together
```

There is no test suite and no CI. Verification is `go build ./...` and
`npx tsc -b --noEmit` (see [09-development.md](09-development.md)).

## Quick numbers

- 21 migrations, 18 domain tables in `public`.
- ~70 routes under `/api/v1` (full list in `router.go` and in Swagger).
- 15 notification types.
- 312 verses in the catalog: 300 from the shared canon plus 12 deuterocanonical
  verses for Catholics only.

# 8. Decision log

Short architecture decision records. Each one says what was decided, why, what
it costs, and what would make it worth revisiting. Sources are commit messages,
code comments, `CLAUDE.md` and `docs/analise-melhorias-2026-07.md`. When the
reason was never written down, the entry says so.

---

### D01. Go with hand-written SQL, no ORM

**Decision**: Go + `chi` + `pgx`, with every query written by hand in the
repository.
**Why**: the motive is not recorded. In hindsight the choice paid off: the
performance work (see D08) depended on full control over each statement —
batches, writable CTEs, concatenated visibility fragments — which an ORM would
have hidden.
**Cost**: verbose scanning code, no compile-time check that SQL matches the
schema, no migrations generated from models.
**Revisit if**: the number of queries grows to the point where `sqlc`-style
generation would catch real bugs.

### D02. Monolithic repository and service files

**Decision**: one `repository.go`, one `service.go`, one `models.go`.
**Why**: a small team finds things faster with one `grep` in one file than by
navigating packages. Splits happen only when an area is self-contained
(`account.go` for LGPD, one handler per resource).
**Cost**: large files and merge conflicts if several people work at once.
**Revisit if**: the team grows or a domain becomes independent enough to stand
alone (moderation is a candidate).

### D03. Supabase for database, auth and storage

**Decision**: Supabase Postgres + Supabase Auth + Supabase Storage, on the free
tier, with the Go backend as the only reader/writer of application tables.
**Why**: auth (email confirmation, magic links, password reset, captcha
integration) and storage come ready, with no cost. The project has a rule of
using only free services.
**Cost**: the database is in `us-west-2`, far from Brazilian users; the anon
key is public and forced the RLS lockdown (D14); free-tier limits (backups,
email rate) needed workarounds (Resend for SMTP).
**Revisit if**: paid plans become acceptable, or a region closer to Brazil is
needed for the database itself.

### D04. Vercel `experimentalServices` (one project, two services)

**Decision**: frontend and backend deploy from one Vercel project, on the same
domain, with the backend under `/_/backend`. Replaced an earlier Fly.io setup
(April 2026), whose `Dockerfile` and `fly.toml` are still in the repo.
**Why**: one deploy, same origin (no CORS in production), free tier.
**Cost**: the feature is marked experimental and the key is deprecated in
favor of `services` + `rewrites`; the backend needs `framework: "go"` pinned
because the legacy `Dockerfile` makes the CLI detect two frameworks; per-service
`regions` is ignored (D05). `DEPLOY.md` keeps a "Plan B" (frontend on Vercel,
backend on Fly).
**Revisit if**: Vercel removes the feature; migrating to `services` is a
routing change of its own.

### D05. Function in pdx1, set in the dashboard

**Decision**: the Go function runs in Portland (`pdx1`), next to the Supabase
database, not in São Paulo next to users.
**Why**: a request made 6+ sequential database trips. From `gru1` each one cost
~150 ms of cross-region latency; from `pdx1` it is < 5 ms. The user pays the
Brazil–US distance once (~160 ms) instead of once per query (the commit
estimated ~800 ms saved per request). The region must be set in the Vercel
dashboard because `experimentalServices` ignores `regions`; the function was
silently running in `iad1` before that was found.
**Cost**: every request crosses the continent once. Static assets are
unaffected (global CDN).
**Revisit if**: the database moves, or requests reliably make a single trip.

### D06. Polling instead of realtime

**Decision**: the app polls (30 s for the unread counter, query refetch for
the rest). No Supabase Realtime, no websockets.
**Why**: simple, works with the serverless backend and the RLS lockdown, and
is enough for a prayer app where seconds of delay do not matter. Moving to
realtime is meant to be a deliberate choice, not a default.
**Cost**: up to 30 s of delay on badges; constant background requests from
open tabs (mitigated with `refetchIntervalInBackground: false`).
**Revisit if**: live features (e.g. "praying now" rooms) become a product goal.

### D07. No background work

**Decision**: notifications and milestones run before the response, grouped
into as few trips as possible.
**Why**: Vercel freezes the function once it responds; a goroutine started
before responding may never finish.
**Cost**: write endpoints wait for their side effects (bounded to one extra
trip for reactions).
**Revisit if**: a queue or a long-running worker is added to the stack.

### D08. Round trips are the performance metric

**Decision**: optimize for the number of database trips, not query time.
Instrumentation (`internal/db/trace.go`) counts trips per request, batches
count as one, and every log line and response carries the count.
**Why**: measurements showed ~200 ms per trip from Brazil and negligible
execution time at the current volume. Feeds went from 2–4 s to ~0.4 s by
batching and parallelizing (table in [10-performance.md](10-performance.md#results)).
**Cost**: some code is less obvious (writable CTEs, batches read in order).
**Revisit if**: the data grows enough that query execution starts to show in
`dbDuration`.

### D09. Indexes deferred

**Decision**: no index tuning beyond the obvious ones until there is a
representative dataset.
**Why**: with dozens of rows the planner ignores indexes; tuning now would be
guesswork. One exception was made where the access pattern was certain
(`prayer_actions (prayer_request_id, action_type)`, migration 000016).
**Revisit if**: any table reaches thousands of rows, or `dbDuration` grows.

### D10. Bounded parallelism for merged feeds

**Decision**: feeds run their streams in parallel with at most 3 concurrent
queries (`runBounded`, `maxParallelQueries = 3`).
**Why**: the pool has 8 connections for the whole process (kept low for the
Supabase pooler). An unbounded six-way fan-out in one request would take most
of the pool and make latency worse under load.
**Revisit if**: `DB_MAX_CONNS` changes.

### D11. Offset pagination with a numbered pager

**Decision**: keep `limit/offset` and a numbered pager; each feed stream
fetches `limit + offset` rows and the service slices.
**Why**: the product wants page numbers. Keyset pagination was evaluated in
July 2026 and consciously deferred.
**Cost**: deep pages get slower; totals are approximate (cached 30 s).
**Revisit if**: people actually reach deep pages, or the feed becomes infinite
scroll.

### D12. Invisible content answers 404

**Decision**: anything the viewer cannot see is "not found", never
"forbidden".
**Why**: a 403 would confirm that a private request or group exists.

### D13. One canonical visibility predicate per content type

**Decision**: `prayerRequestVisibleTo` and `verseShareVisibleTo` are SQL
fragments concatenated into every query that needs them.
**Why**: the rule (author, status, tradition, visibility, groups, blocks) was
being re-implemented per query and drifting. One fragment means one place to
fix.

### D14. RLS on, grants revoked, no policies

**Decision**: RLS on every table, `anon`/`authenticated` privileges revoked,
no policies; the backend bypasses RLS as table owner.
**Why**: the anon key in the bundle let anyone query PostgREST, including
`users.email`. The app never uses PostgREST, so the simplest safe state is
"PostgREST sees nothing".
**Cost**: any future feature that wants direct client access (e.g. Realtime)
needs real policies.

### D15. Tradition as a hard partition

**Decision**: every piece of content stores the author's tradition when
created, and feeds only show the reader's tradition. Reaction types are also
per tradition.
**Why**: Catholic and Evangelical users have different prayer vocabularies
("Ave Maria" vs "Orei") and the product keeps the communities separate.
**Cost**: changing tradition hides your old content from your new community
(and vice versa); a mixed group sees a split wall.

### D16. Verse catalog in the database, text on demand

**Decision**: references, themes and tradition live in `bible_verses`; the text
is fetched from bible-api.com the first time a verse is served and saved.
**Why**: no public Bible API can answer "a verse about hope", so curation has
to be ours; fetching text lazily keeps the seed migration small for the pooler
and lets the translation change without a migration. Deuterocanonical verses
are seeded with text because free Portuguese translations do not include them.
**Cost**: a third-party dependency on first reads (mitigated: 3 s timeout,
neighbor fallback, never fails the request).

### D17. Deterministic daily verse, no scheduler

**Decision**: the verse is `fnv64a(userID|date) % poolSize` over a pool ordered
by `id`, with the date in São Paulo time.
**Why**: there is no cron in this deploy. A deterministic choice is stable all
day, different per user, and needs no stored state.
**Cost**: changing the pool order or size reshuffles everyone's verse.

### D18. Polymorphic `prayer_actions`

**Decision**: verse-share reactions use the same table as prayer reactions,
with a nullable `verse_share_id` and a CHECK that exactly one subject is set.
**Why**: the same reactions apply to both, and profile totals and milestones
count everything in one place. Existing queries were safe because they filter
by `prayer_request_id`, which is never `NULL` for their rows.

### D19. No test suite (for now)

**Decision**: no automated tests and no CI; `go build` and `tsc` are the gate.
**Why**: adding tests is treated as a product decision, not cleanup, and was not
prioritized. Tests "to look professional" are explicitly unwanted.
**Cost**: regressions are caught by hand; risky areas (visibility, moderation,
account deletion) have no safety net.
**Revisit if**: more contributors join, or before large refactors of the
visibility rules.

### D20. UI decisions that were reversed

- **Dark theme dropped** (May 2026): the editorial cream + ink identity is
  light-only, and the dark theme no longer fit it. The old `pv-theme`
  localStorage key is cleared on boot.
- **Onboarding wizard removed** (May 2026): a six-step post-login wizard was
  replaced by picking the tradition in the signup form; login goes straight to
  `/feed`.
- **Notifications not grouped by type**: a friend request got buried below
  prayer notifications, so the page is chronological with pending friend
  requests pinned.
- **Sticky mobile top bar removed**: it took ~140 px and showed content through
  its translucent background; only the bottom tab bar is fixed.

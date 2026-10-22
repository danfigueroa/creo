# Creo technical documentation

For anyone with access to this repository who needs to understand **how the
system is built and why**. Every claim here was checked against the code, and
every identifier mentioned (functions, SQL constants, files) exists and can be
found with `grep`. Line numbers are left out on purpose: they go stale with
every commit.

## Suggested reading order

| # | Document | Read it when |
|---|---|---|
| 1 | [Overview](01-overview.md) | First contact: the product, the domain vocabulary, the repository map |
| 2 | [Architecture](02-architecture.md) | How the pieces connect: deploy, layers, request path, authentication |
| 3 | [Database](03-database.md) | Data model, enums, indexes, RLS and the story behind each migration |
| 4 | [Backend](04-backend.md) | Go code patterns: layers, errors, transactions, notifications, visibility |
| 5 | [Frontend](05-frontend.md) | React structure, state, design system, motion, mobile |
| 6 | [Domains](06-domains.md) | Business rules per area: requests, groups, friends, notifications, verse, account |
| 7 | [Security and privacy](07-security-privacy.md) | Defenses at each layer, data export and account deletion (LGPD) |
| 8 | [Decisions](08-decisions.md) | Architecture decision log, with context and consequences |
| 9 | [Development](09-development.md) | Running locally, environment variables, migrations, build, common problems |
| 10 | [Performance](10-performance.md) | Round-trip budget, how to measure, feed optimizations, caches, before/after numbers |

If you are going to touch a feed or any query, read at least 3, 4, 6 and 10 first.

## How this relates to the other docs

| File | Role |
|---|---|
| `CLAUDE.md` | **Prescriptive** guide for AI agents (in Portuguese): short do/don't rules. These docs **explain**; CLAUDE.md **instructs**. If they disagree, the code wins and one of them needs fixing. |
| `README.md` | Repository entry point: what Creo is, stack, quick start and links. Kept short on purpose; details live here. |
| `DEPLOY.md` | Step-by-step deploy (Vercel, Supabase, Resend, Turnstile), in Portuguese. These docs point to it instead of repeating it. |
| `SETUP-SEGURANCA.md` | Order in which the security-related dashboard settings must be turned on. |
| `ROADMAP.md` | Post-redesign roadmap from May 2026. Historical. |
| `docs/product-spec.md`, `docs/analise-melhorias-2026-07.md`, `docs/oportunidades.md` | Original product spec, July 2026 performance review, list of improvement ideas. Local to the owner's machine, not versioned (`docs/` is in `.gitignore` except for this folder). |
| `backend/internal/http/apidocs/openapi.yaml` | API contract, served as Swagger UI at `/docs`. Source of truth for payloads and error codes. |

## Conventions

- Written in English. The product UI is in Brazilian Portuguese; UI strings are
  quoted in Portuguese with a translation where it helps.
- When the reason behind a decision was never recorded (commit, comment,
  conversation), the text says so instead of making one up.
- Surprising behavior, or behavior that diverges from what you would expect, is
  flagged with ⚠️. Not necessarily a bug, but read it before changing that code.
- Diagrams use Mermaid; GitHub and VS Code (with an extension) render them.

## Keeping it current

Changed the schema, the request path, a business rule or an architecture
decision? Update the matching file in the same PR, in a separate `docs:` commit
(see the commit conventions in `CLAUDE.md §5`). The
[migration history](03-database.md#migration-history) and the
[decision log](08-decisions.md) go stale fastest.

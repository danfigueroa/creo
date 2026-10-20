# 5. Frontend

React 18 + TypeScript, Vite 5, React Router 6, TanStack Query 5, Zustand 5,
Tailwind 3 (secondary to hand-written CSS), `motion` for animation, i18next for
translations, axios for HTTP, `@supabase/supabase-js` for auth and storage.

## Folder layout (`frontend/src`)

| Folder | Contents |
|---|---|
| `app/` | `router.tsx` (routes, lazy loading), `route-guards.tsx` (`RequireAuth`, `PublicEntry`), `providers.tsx` (QueryClient, i18n, motion, toasts, confirm dialog, Supabase session listener) |
| `pages/` | One file per route |
| `components/` | Shell (`page-shell.tsx`), feed cards (`feed-card.tsx`), modals (`new-request-modal.tsx`, `share-verse-modal.tsx`), notifications, `landing/` |
| `state/` | Zustand stores: `session-store.ts`, `composer-store.ts`, `verse-composer-store.ts` |
| `lib/` | `api.ts` (axios + interceptors), `supabase.ts` (client + uploads), `traditions.ts` (reactions per tradition), `i18n.ts`, `analytics.ts`, `notifications.ts`, `use-notifications.ts`, `motion.ts`, `password.ts`... |
| `locales/` | `pt-BR.json`, `en.json`, `es.json` |
| `index.css` | Design tokens and all design-system classes |

Path alias: `@/` → `src/`.

## Routes

| Path | Page | Notes |
|---|---|---|
| `/` | `PublicEntry` → `LandingPage` | Signed-in users go to `/feed` |
| `/auth` | `AuthPage` | Email-link callbacks (`token_hash` + `type`, verified with `verifyOtp`) |
| `/auth/reset` | `AuthResetPage` | Only allows a password change coming from a recovery link |
| `/feed` | `FeedPage` | Tabs: home, groups, friends, public |
| `/groups`, `/groups/new`, `/groups/:id` | Groups list, create, group page (wall, members, requests, settings) |
| `/groups/:id/announcements/new`, `.../:aid/edit` | `AnnouncementPage` |
| `/friends` | `FriendsPage` |
| `/notifications` | `NotificationsPage` |
| `/requests/:id` | `RequestDetailPage` | Detail, reactions, who prayed, updates, answered |
| `/verses/:id` | `VerseSharePage` |
| `/profile`, `/u/:username` | Own profile (with account settings), public profile |
| `/moderation` | `ModerationPage` |

Everything except `/`, `/auth` and `/auth/reset` is behind `RequireAuth` and
lazy-loaded. Authenticated pages render `<PageShell>` themselves; the landing
and auth pages must **not**, because the shell calls `GET /profile`, which
needs a session.

**A new dynamic route must be added to `DYNAMIC_ROUTES` in
`lib/analytics.ts`**, otherwise ids and `@usernames` leak into the analytics
dashboard. `anonymizeAnalyticsEvent` replaces dynamic segments with the
parameter name and drops the query string.

## State

| Kind | Tool | Notes |
|---|---|---|
| Server data | TanStack Query | Default `staleTime` 30 s, `retry` 1 |
| Access token | `useSessionStore` (Zustand) | Written to `localStorage` by hand; synced with Supabase in `AppProviders` |
| New-intention modal | `useComposerStore` | `openComposer(defaultGroupId?, onCreated?)` from anywhere |
| Share-verse modal | `useVerseComposerStore` | Same idea for the verse of the day |

There is exactly **one** `<NewRequestModal>`, rendered by `PageShell` and
controlled by the composer store. Pages call `openComposer` instead of mounting
their own modal (two modals on `/feed` was a past bug).

### Query keys

Shape: `[resource, scope, ...filters]`. Keys that are shared on purpose:

| Key | Used by | Why it matters |
|---|---|---|
| `['profile', 'me']` | `PageShell` and every page that needs the current user | Variants like `['profile','shell']` were merged; one request per screen |
| `['notifications', 'unread-count']` | `useNotificationSummary()`: bell, sidebar, tab bar, page title, wall banner | One cache, one 30 s poll. Do not create another counter query |
| `['friends', 'shell']` | Sidebar "Em oração agora" (praying now) | Same endpoint as the friends page |
| `['feed', ...]` | Feed tabs | Mutations invalidate by prefix |
| `['group', 'feed', id]`, `['group', 'details', id]`, `['group', 'members', id]` | Group page | |

After a mutation, invalidate the narrowest key that is correct:

```ts
queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
```

Optimistic updates use `onMutate` (snapshot + `setQueryData`), rollback in
`onError`, and invalidate in `onSettled`. Reference implementation: the wall in
`pages/group-page.tsx`.

### Polling

There is no realtime; the app polls. `refetchInterval: 30_000` with
`refetchIntervalInBackground: false` where the value only matters while the tab
is visible (the unread counter). Moving to Supabase Realtime would be a
deliberate decision, not a default (see [08-decisions.md](08-decisions.md)).

## Talking to the API

`lib/api.ts` exports one axios instance.

- **Request interceptor**: reads the current session from Supabase
  (`getSession()`), updates the store if the token changed, and sets
  `Authorization: Bearer`.
- **Response interceptor**:
  - network error on `localhost` → retries once on `127.0.0.1` (and vice
    versa);
  - `401 ACCOUNT_DELETED` → `signOut({ scope: 'local' })`, clear token;
  - other `401` → `refreshSession()` once and retry; if the refresh fails,
    `signOut({ scope: 'local' })`, otherwise `getSession()` would keep
    returning the dead token.
- Error payloads follow the backend envelope; `lib/api-error.ts` reads the
  `code`.

Client-side validation mirrors the backend **as helper text** (title 3–120,
body 10–4000, group name 3–80, description ≤ 500, password ≥ 8 from
`PASSWORD_MIN` in `lib/password.ts`). The backend remains the authority.

## Uploads

Images go straight from the browser to Supabase Storage (`lib/supabase.ts`):
JPEG/PNG/WEBP up to 2 MB, public buckets `avatars`
(`{userId}/avatar-{ts}.{ext}`) and `group-photos`
(`{groupId}/cover-{ts}.{ext}`, `{groupId}/announcements/{ts}-{rand}.{ext}`).
The timestamp in the name avoids stale CDN copies. The resulting public URL is
then sent to the backend, which only accepts URLs from this project's Storage
(`validImageURL`). Forms that resend the whole object must send the image field
only when it changed.

## Authentication screens

The landing page holds the whole auth flow in `<AuthDialog>` (right-side
drawer, full screen ≤ 640 px) with `<AuthCard>`: password login, magic link,
signup, resend confirmation, captcha. `/?auth=entrar|criar` opens the drawer
directly. The tradition picked in the landing playground pre-selects signup
(only if the visitor actually clicked one).

- Email confirmation is required. A "Email not confirmed" login error offers a
  resend with a 60 s cooldown (`useCooldown`).
- Email templates (`supabase/templates/`) link with `token_hash`, not the PKCE
  `ConfirmationURL`, so links work in any browser.
- `/auth/reset` only allows the change with `token_hash` + `type=recovery`, or
  the `creo-recovery` flag in `sessionStorage`. The flag is set by the
  `PASSWORD_RECOVERY` listener in `lib/supabase.ts`, because that event fires
  before the page mounts. After saving: `signOut({ scope: 'others' })`.
- Captcha: `useCaptcha()` + `<TurnstileWidget>` + `captchaOption(token)`
  (`components/turnstile.tsx`) on every Supabase auth call that Supabase
  protects. Tokens are single-use: `captcha.reset()` in `finally`. Without
  `VITE_TURNSTILE_SITE_KEY` the widget is hidden (dev).
- Account settings (`components/account-security.tsx`): change password
  (re-checks the current one with `signInWithPassword`), change email,
  sign out of this or all devices, export data, delete account (current
  password + typing the `@username`).

## Design system

Editorial identity: warm cream background (`--bg: #F0E6D0`) and a single ink
teal (`--ink: #0E4A53`). Light only (the dark theme was dropped in May 2026).
Fonts: **Source Serif 4** (headlines, post titles, italic placeholders),
**Geist** (UI), **Geist Mono** (hints like ⌘K).

- **Tokens** on `:root` in `index.css`: surfaces (`--bg`, `--bg-soft`,
  `--card`, `--card-2`), ink scale (`--ink`, `--ink-2`, `--ink-3`, `--muted`,
  `--muted-2`), lines (`--line`, `--line-2`), type (`--serif`, `--sans`,
  `--mono`), radii (`--r-1`…`--r-4`, `--r-pill`), shadows. Old names
  (`--primary`, `--panel`...) are aliases to the new values, so Tailwind
  utilities like `bg-primary` keep working.
- **Classes**: `.feed` (720 px canvas), `.tabs` + `.tabs__ink`, `.post*`,
  `.rx*` (reaction pills with pop/burst animation), `.cat-pill`, `.btn*`,
  `.iconbtn`, `.pager*`, `.canvas` (non-feed pages; `.canvas--wide` 1040 px),
  `.form` / `.field*` / `.choice-grid`, `.plist` / `.prow` / `.friend-card`,
  `.menu-pop`, `.modal*`. The landing uses `.lp-*`. Legacy `pv-*` classes
  still exist but should not be used in new code.
- **Reactions** (`lib/traditions.ts`): each `PrayerAction` has a `glyph`
  (rose/sun/diamond/beads/ring, drawn by `components/glyph.tsx`) and four oklch
  colors passed as CSS variables (`--rx-bg`, `--rx-border`, `--rx-fg`,
  `--rx-dot`). Evangelical actions reuse the same glyphs with their own labels.
- **Avatars and group marks** derive an oklch hue from a hash of the username
  or group name, so they are stable without stored colors.
- Forms are vertical. Opaque `<select>`s are replaced by grids of radio cards
  (`aria-pressed`).
- No emojis in narrative text; emojis are fine as UI icons.

## Mobile (≤ 900 px)

The shell breakpoint is **900 px**, not Tailwind's `sm`/`lg`. Layout that
depends on the sidebar must use 900 px.

- The only fixed chrome is `.mobile-tabbar` (5 tabs: wall, notifications,
  friends, groups, profile). The top bar becomes `position: static` and scrolls
  away. It used to be sticky, took ~140 px and showed content through its
  translucent background.
- Never hardcode bottom spacing. Tokens on `:root`: `--safe-b`
  (`env(safe-area-inset-bottom)`, which only resolves because `index.html` has
  `viewport-fit=cover`), `--tabbar-h` (0 on desktop, 62 px on mobile, applied
  as the tab bar's real height), `--chrome-b` (tab bar + safe area + room for
  the FAB). Only `PageShell`'s `<main>` applies `padding-bottom:
  var(--chrome-b)`; nested `<main>`s must not add their own.
- z-index scale (documented in `:root`): 5 sticky top bar · 40 tab bar · 41
  compose FAB · 45 dropdowns and card menus · 60 mobile search sheet · 90
  confirm dialog · 100 modal veil · 110 toasts. New overlays use one of these
  steps.
- `--tab-w` on `.tabs` must be a length, never a percentage: `.tabs__ink` moves
  with `translateX(calc(var(--idx) * (var(--tab-w) + 4px)))`, and a percentage
  inside `translateX` resolves against the ink itself, not the container.
- Inputs at ≥ 16 px on mobile, otherwise iOS Safari zooms on focus.

## Animation

- Library `motion` (import from `motion/react`), loaded through
  `<LazyMotion features={domMax} strict>`. **Always use `m.*`, never
  `motion.*`**: `strict` throws in dev otherwise. `domMax` because toasts and
  lists animate layout. It ships as its own chunk.
- Presets in `lib/motion.ts`: `ease` (same `.2,.7,.2,1` curve as the CSS),
  `duration`, `fadeUp`, `popIn`, `fade`, `revealUp`, `springSoft`,
  `stagger(i)`. Movement is restrained: 120–400 ms, no strong bounce, no
  decorative loops.
- Reduced motion: `<MotionConfig reducedMotion="user">` for JS, and a
  `prefers-reduced-motion` block at the end of `index.css` for CSS keyframes.
- Patterns: lists with `MotionItem` + `useSettledKey`
  (`components/motion-list.tsx`) inside `<AnimatePresence mode="popLayout">`;
  numbers with `<CountUp>` (animates on change, never on mount); overlays with
  `<AnimatePresence>{open && <m.div ...>}` (do not go back to
  `if (!open) return null`, which kills the exit animation).
- Reaction pop/burst and `.tabs__ink` stay in CSS on purpose.

## Internationalization

i18next with three bundles (`pt-BR`, `en`, `es`), fallback `pt-BR`. Detection
order: `localStorage` (`creo-lang`) then the browser. Any detected value is
normalized to one of the three codes. When signed in, `useLanguage()` also
saves the choice with `PATCH /profile/language`, so it follows the user across
devices. Labels for categories, traditions and reactions come from the bundles.
Portuguese is the primary language: copy is written there first.

## Landing page

`pages/landing-page.tsx` + `components/landing/` shows the product with
fictional data (`demo-data.ts`) and no API calls: sticky nav, hero with a live
mockup (`hero-demo.tsx`, paused off-screen and under reduced motion), "how it
works" with a scroll-driven sticky mockup, reactions/tradition playground and
privacy diagram, feature bento, FAQ and final CTA. The reaction pills use the
real `prayerActionsFor` and `.rx` markup, so the showcase cannot drift from the
product. The landing is in the initial bundle: do not import `feed-card` or
other heavy pieces into it.

## Skeletons and feedback

- Loading states: `<span className="pv-shimmer ...">` in `[0,1,2,3].map()`
  loops, or `<FeedSkeleton>`.
- Toasts: `useToast()` from `components/toaster.tsx`.
- Destructive actions: `ConfirmDialogProvider` (`components/confirm-dialog.tsx`).

## Navigation from notifications

`targetPath` in `lib/notifications.ts`, by `subject_type`:

| Subject | Destination |
|---|---|
| `PRAYER_REQUEST` | `/requests/{id}` |
| `FRIENDSHIP` | `/friends` while the request is pending, otherwise `/u/{actor}` |
| `GROUP` | `/groups/{id}` |
| `VERSE_SHARE` | `/verses/{id}` |
| `MILESTONE` | `/profile` |
| anything else | `/feed` |

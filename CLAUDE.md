# CLAUDE.md

Guia operacional pra agentes que vão trabalhar neste repositório. O objetivo é evitar redescobrir convenções a cada sessão.

---

## 1. O que é este projeto

**Creo** (anteriormente Paróquia Viva) é uma rede social de oração para comunidades de fé — católicas e evangélicas. Foco em:

- Pedidos de oração com privacidade granular (público / só grupo / privado / anônimo)
- Grupos comunitários (pastorais, células) com papéis (ADMIN > MODERATOR > MEMBER)
- Rede de amigos (`@username`)
- Notificações in-app
- Moderação (estrutura presente; fluxo completo em Phase 2)

Idioma da UI/copy: **português brasileiro**. Identificadores no código (variáveis, JSON keys, enums, error codes): **inglês**.

---

## 2. Stack

- **Backend**: Go 1.22+, `chi` v5, `pgx` v5 + `pgxpool`, SQL escrita à mão
- **Frontend**: React 18 + TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, Zustand
- **Banco / Auth**: Supabase Postgres (pooler `:6543`) + Supabase Auth (JWT validado via JWKS no backend)
- **Migrations**: `golang-migrate`
- **Deploy**: Vercel (`experimentalServices` — frontend `vite` + backend Go) com `regions: ["pdx1"]` no `backend/vercel.json` (perto do Supabase em `us-west-2`)

---

## 3. Estrutura do repositório

```
backend/
  cmd/api/                  # entrypoint
  internal/
    auth/                   # Supabase JWT validator (JWKS cache)
    config/                 # env loader
    db/migrations/          # *.up.sql / *.down.sql, golang-migrate
    http/
      handlers/             # 1 arquivo por recurso (group_handler.go etc)
      middleware/           # auth, logging, request-id, CORS, rate-limit
      shared/               # WriteJSON, WriteError
      router.go             # chi routes em um único bloco
    models/models.go        # TODOS os structs e enums em um arquivo só
    repositories/repository.go  # 1 arquivo monolítico, interface no topo
    services/service.go     # 1 arquivo monolítico, validações + Err* sentinels
  Dockerfile                # backup local; Vercel não usa
  fly.toml                  # legado de Fly; não em uso
  vercel.json               # só com regions
  .env / .env.example
frontend/
  src/
    app/                    # router.tsx, route-guards.tsx, providers.tsx
    components/             # Button, Input, TextArea, PageShell, FeedCard, NotificationBell, ...
    pages/                  # 1 arquivo por rota
    state/session-store.ts  # Zustand: accessToken (persiste em localStorage)
    lib/                    # api (axios instance), supabase, traditions, utils
    index.css               # tokens (--bg, --panel-surface, --primary, ...) + classes pv-*
  vercel.json               # framework vite + SPA rewrite + cache headers
  .env / .env.example
docs/product-spec.md
DEPLOY.md
README.md
Makefile
vercel.json                 # raiz: experimentalServices
```

---

## 4. Comandos

### Rodar tudo (back + front em paralelo)

```bash
make dev
```

Sobe `backend/cmd/api` em `:8080` e Vite em `:5173`. `Ctrl+C` derruba os dois (`trap 'kill 0' SIGINT`).

### Migrations

```bash
cd backend
set -a && source .env && set +a
migrate -path internal/db/migrations -database "$DATABASE_URL" up
# down: ... down 1
```

Próximo número: olhar `backend/internal/db/migrations/` e somar 1 ao maior `NNNNNN_*`.

### Compile / type-check

```bash
cd backend && go build ./...
cd frontend && npx tsc -b --noEmit
```

Ambos retornam exit 0 sem output quando passam. **Sempre rodar antes de declarar fim de implementação.**

### Cuidado com porta 8080 grudada

`go run` deixa o binário rodando mesmo após `pkill make`/`pkill go`. Se ver `bind: address already in use`:

```bash
lsof -ti:8080 | xargs -I{} kill -9 {}
pkill -f "node.*vite" 2>/dev/null
```

E reiniciar `make dev`.

---

## 5. Convenções de commit

**Conventional Commits**, escopos do projeto: `db`, `groups`, `auth`, `landing`, `frontend`, `deploy`, `infra`.

```
feat(groups): add admin endpoints for details, members and group feed
refactor(auth): redesign sign-in page with hero panel and clearer form
fix(deploy): move backend region pin to per-service vercel.json
```

Body explicando o **porquê**, não o quê. Bullet list é OK para mudanças com várias facetas.

### NÃO incluir `Co-Authored-By: Claude` (regra do dono do repo)

Crie commits limpos, com o autor do git (`dan figueroa <danielmfigueroa@gmail.com>`).

### Quando juntar / quando separar

**Default: dividir o máximo possível.** Cada concern, cada motivação, cada bug fix incidental descoberto durante o trabalho deve ser commit próprio. O objetivo é que cada commit possa ser revertido isoladamente sem arrastar coisa não relacionada — facilita `git bisect`, `git revert`, code review e leitura do histórico.

Heurísticas:
- Migration de schema fica em commit próprio (`feat(db): ...`).
- Nova rota backend + UI que a consome → 1 commit por camada se forem revisáveis sozinhas (back primeiro, front depois). Se não fizerem sentido sem o outro lado (ex: shape de payload entrelaçado), 1 commit coeso.
- Bug fix incidental descoberto durante uma feature → commit separado (`fix:`), não enfia no `feat:`.
- Refactor preparatório (mover código, renomear sem mudar comportamento) → commit antes da mudança de comportamento.
- Polish/cleanup independentes da feature → commits próprios mesmo que pequenos.
- Mudança de docs (`CLAUDE.md`, `README.md`, `DEPLOY.md`) → `docs:` separado da mudança de código que motivou.
- Em dúvida entre 1 commit grande ou 2 menores: **2 menores**. Para um chunk grande de trabalho, 5-10+ commits é o esperado.

---

## 6. Workflow esperado

1. **Plan-mode** automático quando o usuário entra (Claude Code abre via system reminder). Sempre escrever/editar o plan file antes de `ExitPlanMode`.
2. Para **perguntas exploratórias** ("o que acha de…", "vamos…?"), responder em **2-3 frases com recomendação + tradeoff** e perguntar se segue completo ou enxuto. Não implementar antes da confirmação.
3. Após confirmação, ler o código relevante, fazer as edições, rodar `go build`/`tsc`, e dar um resumo curto do que mudou e como testar.
4. **Commits são feitos só quando o usuário pede explicitamente**. Mantenha working tree limpo antes de pedir? Não — esperar pedido.
5. Se a UI mudou, reiniciar dev server quando necessário (rotas backend novas / port grudada).

---

## 7. Padrões de backend

### Camadas

`handler → service → repository`. Nunca pular camadas. Handlers não falam com `pgxpool`. Services validam e mapeiam erros. Repositories executam SQL.

### Erros

- Sentinels exportados em `services/service.go` (`ErrInvalidTitle`, `ErrPermissionDenied`, `ErrLastAdmin`, `ErrCannotTargetSelf`, `ErrInvalidGroupRole`) e em `repositories/repository.go` (`ErrGroupNotFound`, `ErrJoinRequestNotFound`, `ErrFriendRequestNotFound`, `ErrUsernameTaken`, ...).
- Handler mapeia `errors.Is(...)` → status HTTP + `code` string em CAPS. Padrão de resposta de erro (ver `shared.WriteError`):
  ```json
  { "error": { "code": "FORBIDDEN", "message": "...", "details": {} } }
  ```
- Códigos comuns: `INVALID_JSON`, `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND` (com sufixo do recurso, ex.: `GROUP_NOT_FOUND`), `LAST_ADMIN`, `INTERNAL_ERROR`, `USER_SYNC_FAILED`.

### `ensureAuthUser`

Todo handler **protegido** que pode ser a primeira ação do usuário deve chamar `ensureAuthUser(h.service, r)` no topo. Sincroniza o usuário do Supabase pra tabela `users` interna.

### Transações

Operações multi-passo (ex.: aprovar join request + inserir membership) usam `tx, _ := r.db.Begin(ctx)` + `defer tx.Rollback(ctx)` + `tx.Commit(ctx)`. Notificações inseridas dentro da mesma tx do evento que as origina.

### Notificações

Sistema in-app, **best-effort**: `_ = insertNotificationOn(ctx, exec, in)` — falha não derruba a ação principal. Helpers em `repositories/repository.go`:

- `insertNotificationOn(ctx, exec, in)` — exec = `pool` ou `tx` (ambos satisfazem `notifyExec` interface local).
- `r.notifyGroupAdminsOfJoinRequest(ctx, requesterUserID, groupID)` — itera admins.
- `r.notifyGroupMembersOfAnnouncement(...)` — fan-out em um único `INSERT ... SELECT` (não iterar membros).
- Self-notification é evitada (skip `if actor == recipient`).
- Eventos suportados (lista completa em `models.go`, `NotificationType*`): `PRAYED`, `FRIEND_REQUEST_RECEIVED`, `FRIEND_REQUEST_ACCEPTED`, `GROUP_JOIN_APPROVED`, `GROUP_JOIN_REQUESTED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_CHANGES_ASKED`, `REQUEST_UPDATED`, `REQUEST_ANSWERED`, `GROUP_ANNOUNCEMENT_POSTED`, `MILESTONE_PRAYED`, `MILESTONE_CREATED`, `MILESTONE_STREAK`.
- `subject_type ∈ {PRAYER_REQUEST, FRIENDSHIP, GROUP, MILESTONE}` — `subject_id` permite o front navegar.

### Performance de feed (convenções)

- **Feeds mesclados** (home, groups, mural do grupo) buscam `limit+offset` linhas **cruas** de pedidos + anúncios, mesclam/fatiam no service e só então chamam `repo.EnrichPrayerRequests` na página final. Não voltar a enriquecer dentro de `ListHomePrayerRequests`/`ListGroupsPrayerRequests`/`ListPrayerRequestsByGroup`.
- **COUNTs de feed** passam por `Service.cachedCount` (TTL 30s, `feedCountTTL`). Novos counts de feed devem usar o mesmo helper.
- `prayer_actions` tem índice `(prayer_request_id, action_type)` (migration 000016) para a agregação de reações do enrich — preservar esse padrão de acesso.
- Feed público **anônimo** responde `Cache-Control: s-maxage=30` (CDN). Não adicionar cache em resposta autenticada sem `Vary`/cuidado.

### Tradition (catolica/evangélica)

`prayer_requests.tradition` filtra feeds para o `tradition` do viewer (ver SQL em `ListPrayerRequestsByGroup`, etc). **Se mexer em query de feed, preserve esse filtro.**

### Soft delete

Tabelas usam `deleted_at TIMESTAMPTZ` (nullable). Toda query de listagem precisa `WHERE deleted_at IS NULL` (e em joins com users, `u.deleted_at IS NULL`). Índices parciais (`WHERE deleted_at IS NULL`) já existem para `group_memberships` e `groups`.

### Roles e rank

```go
RoleRank(RoleAdmin) = 3
RoleRank(RoleModerator) = 2
RoleRank(RoleMember) = 1
```

Regra de remoção de membro: actor precisa **outrank** target (admin > moderator; admin > member; moderator > member). Espelhar essa regra no frontend via `ROLE_RANK` em TS.

---

## 8. Padrões de frontend

### Routing

`app/router.tsx` usa `createBrowserRouter` com:

- `/` → `<PublicEntry />` em `app/route-guards.tsx`: se logado → `Navigate` pra `/feed`, senão → `<LandingPage />`.
- `/auth` → tela de login/signup (Supabase via `@supabase/supabase-js`).
- Rotas autenticadas envoltas em `<RequireAuth />` (redireciona pra `/auth?next=...` se sem token).
- Páginas autenticadas envolvidas com `<PageShell>` (header + nav + busca + sino + menu de perfil).
- `LandingPage` e `AuthPage` **NÃO** usam `PageShell` (que faz GET /profile e quebra sem sessão).

### Logout

`PageShell.onLogout` zera `accessToken` no Zustand e navega `/` (replace). `PublicEntry` renderiza a landing.

### Estado

- **Zustand** (`state/session-store.ts`) só pra `accessToken` (persistido em `localStorage`).
- **TanStack Query** pra todo o resto. Padrão: `useQuery({ queryKey: [resource, scope, ...filters], queryFn })` + invalidação em mutations:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
  ```
- Mutations otimistas usam `onMutate` + rollback em `onError` + `onSettled` (ver `GroupMural` em `pages/group-page.tsx`).

### Polling

`refetchInterval: 30_000` + `refetchIntervalInBackground: false` quando o que importa só faz sentido com a aba ativa (ex.: `unread-count` do sino).

### Telas e shell

- **`/`** (`pages/landing-page.tsx`) — Welcome screen 2-col com hero editorial à esquerda (brand mark, título serif gigante com itálico, lede, 3 features numeradas, citação Mt 18,20) e auth card à direita (tabs Entrar/Criar com underline animado, magic-link). Sign-in bem-sucedido roteia pra `/feed`. A tradição escolhida antes do login fica em `localStorage.creo-pending-tradition` e é aplicada pós-login via PATCH `/profile/tradition` (a chave só é removida quando o PATCH tem sucesso).
- **`/auth`** (`pages/auth-page.tsx`) — usado por callbacks de email/reset; não é a entrada principal mais. (O onboarding wizard foi **removido** — não existe `/onboarding`.)
- **`/feed`** (`pages/feed-page.tsx`) — canvas `.feed` 720px, headline serif, tabs com `tabs__ink`, composer quiet (abre modal global), posts.
- **`/requests/:id`** (`pages/request-detail-page.tsx`) — IntentionDetail editorial: header + body em serif, total de orações destacado, reactions row, "Quem rezou" agrupado, "Atualizações do autor" (**funcional**: `GET/POST /requests/:id/updates`), marcar como atendido com testemunho (`POST/DELETE /requests/:id/answer`), "Compartilhar com" (PATCH /requests/:id — visibilidade por grupo, não é share externo).
- **`/notifications`** (`pages/notifications-page.tsx`) — página completa com agrupamento por tipo (orações, comunidade, grupos, outros). Sino na topbar **navega pra cá** (não tem mais dropdown). Sidebar tem item "Notificações" com pip vermelho idem.
- **`/groups`, `/groups/:id`, `/profile`, `/u/:username`, `/friends`, `/moderation`, `/groups/:id/announcements/*`** — visual existente, retokenizado pelos aliases.

### Componentes-chave

- `components/page-shell.tsx` — `.app` grid (sidebar 248px + stage). Sidebar tem brand + nav (Mural, Notificações, Amigos, Grupos, Criar grupo) + "Em oração agora" (top friends do `/friends`) + `side__me` no rodapé. Topbar com search pill + **botão "+ Nova intenção"** (`btn btn--ghost-out top__compose`) + sino linkando pra `/notifications`.
- `state/composer-store.ts` — Zustand store global pro modal de nova intenção. PageShell renderiza o **único** `<NewRequestModal>` controlado por essa store; qualquer página chama `openComposer(defaultGroupId?, onCreated?)` (não montar um segundo modal local). O feed passa `onCreated` pra navegar pra aba correspondente à visibilidade criada.
- **Query key de perfil**: todas as telas usam `['profile', 'me']` pro `GET /profile` (dedupe entre PageShell e páginas). Não criar variações (`['profile','shell']`, `['profile','feed']`, ... foram unificadas).
- `components/feed-card.tsx` — `PrayerCard` com total no head + Editar; reactions no rodapé. `AnnouncementCard` com hero image + event date badge.
- `components/glyph.tsx` — 5 marcas geométricas (rose/sun/diamond/beads/ring) usadas pelas reaction pills.
- `lib/traditions.ts` — `Tradition` agora é `'CATHOLIC' | 'EVANGELICAL' | 'BOTH' | 'NONE'` (TS). Cada `PrayerAction` tem `denoms[]` que limita visibilidade. `toSavedTradition(t)` colapsa BOTH/NONE pra CATHOLIC (backend ainda não tem os 4 valores).

### Estilo

**Identidade editorial**: cream warm (`#F0E6D0`) + ink teal (`#0E4A53`) single-color. Sem accent laranja, sem dark theme. Tipografia: **Source Serif 4** (italic em placeholders, regular em headlines/títulos de post) + **Geist** sans pra UI + **Geist Mono** pra hints (⌘K).

- **Tokens** em `index.css`:
  - Surfaces: `--bg`, `--bg-soft`, `--card`, `--card-2`
  - Ink scale: `--ink`, `--ink-2`, `--ink-3`, `--muted`, `--muted-2`
  - Linhas: `--line` (8% ink), `--line-2` (14% ink)
  - Type stack: `--serif`, `--sans`, `--mono`
  - Radii: `--r-1`/`--r-2`/`--r-3`/`--r-4`/`--r-pill`
  - Sombras: `--shadow-1`, `--shadow-2`
  - Aliases pros nomes antigos (`--primary`, `--panel`, `--secondary`, etc.) apontam pra novos valores — Tailwind utilities (`bg-primary`, `text-onPrimary`, `border-primary/40`) continuam funcionando.
- **Sem `data-theme`**: dark theme foi dropado. Não use `:root[data-theme=...]`.
- **Layout shell** (`components/page-shell.tsx`): `.app` grid (sidebar 248px + stage). Sidebar tem brand mark + `.navitem` por rota + "Em oração agora" (top friends do `/friends`) + `.side__me` no rodapé. Topbar (`.top`) com `.top__search` pill + `.iconbtn` do sino.

#### Mobile (≤900px) — chrome e tokens

O breakpoint do shell é **900px** (`max-width: 900px`), não os `sm:`/`lg:` do Tailwind (640/1024px). Para layout que depende da sidebar, o breakpoint certo é o do shell.

- **A única chrome fixa é o `.mobile-tabbar`** (5 abas: Mural · Avisos · Amigos · Grupos · Perfil). A topbar `.top` vira `position: static` e **rola pra fora** — não voltar a deixá-la sticky no mobile: ela ocupava 3 linhas (~140px) e o fundo translúcido fazia o conteúdo aparecer por baixo.
- **Nunca hardcodar clearance inferior.** Os tokens em `:root` são a fonte da verdade:
  - `--safe-b` = `env(safe-area-inset-bottom)` (só resolve porque `index.html` tem `viewport-fit=cover` — não remover)
  - `--tabbar-h` = 0px no desktop, 62px no mobile; `.mobile-tabbar` aplica isso como `height` explícita, então o token é medida real, não estimativa
  - `--chrome-b` = clearance de canvas (tabbar + safe area + espaço do FAB)
  - Só o `<main>` do PageShell carrega `padding-bottom: var(--chrome-b)`. `.notifs`/`.detail`/`.profile` são `<main>` **aninhados** dentro dele — se ganharem padding inferior próprio, a folga dobra.
- **Escala de z-index** (documentada no `:root` do `index.css`): 5 topbar sticky · 40 tabbar · 41 FAB · 45 dropdowns e menus de card · 60 folha de busca · 90 confirm-dialog · 100 modal-veil · 110 toasts. Qualquer overlay novo entra num desses degraus.
- **`--tab-w` do `.tabs` tem que ser um comprimento, nunca porcentagem.** `.tabs__ink` posiciona por `translateX(calc(var(--idx) * (var(--tab-w) + 4px)))`, e porcentagem dentro de `translateX` resolve contra a largura do próprio ink, não do container — o underline sai do lugar mas as abas continuam parecendo certas, então o bug passa batido. No mobile usa `calc((min(100vw - 40px, 720px) - 12px) / 4)`, onde o `min()` respeita o `max-width: 720px` da `.feed`.
- **Inputs de mobile em ≥16px**: abaixo disso o Safari do iOS dá zoom na página ao focar.
- Ao mexer em `.top`, cuidado com a cascata: `.iconbtn { display: grid }` é declarado depois de `.top__searchbtn`, daí o seletor composto `.iconbtn.top__searchbtn`.
- **Classes do design** (em `index.css`, ported verbatim):
  - `.feed` — canvas central 720px com headline serif
  - `.tabs` + `.tabs__ink` — abas com underline animado via `--idx`
  - `.composer` — card de compose com expand state
  - `.post`, `.post__head`, `.post__title`, `.post__text`, `.post__foot`, `.post__total` — card de pedido
  - `.rx`, `.rx--on`, `.rx--pop`, `.rx__glyph`, `.rx__count`, `.rx__burst` — pílulas de reação com animação. CSS vars `--rx-bg`, `--rx-border`, `--rx-fg`, `--rx-dot` setadas inline.
  - `.cat-pill` — badge de categoria com bg/fg oklch tinted
  - `.btn`, `.btn--primary`, `.btn--ghost`
  - `.iconbtn` + `.iconbtn__pip`
  - `.pager`, `.pager__btn`, `.pager__num`
- **Reações** (`lib/traditions.ts`): cada `PrayerAction` tem `glyph` (rose/sun/diamond/beads/ring) + 4 valores oklch. Católico mapeia 1:1 com o design; evangélico reusa os mesmos glyphs com labels próprios. Componente `<Glyph kind="..." />` em `components/glyph.tsx`.
- **Avatar** (`components/avatar.tsx`): monogram com hue oklch derivado por hash determinístico do `username`. Quando há `avatarUrl`, mostra a foto.
- **Classes legacy ainda existem** (`pv-panel`, `pv-title`, `pv-muted`, `pv-chip`, `pv-shimmer`, `pv-tab-underline*`) e foram remapeadas pros novos valores — `pv-title` agora aplica serif. Não criar novas — preferir as do design (`.post`, `.cat-pill`, `.btn`, etc.) em código novo.
- **Tailwind**: complementa via tokens semânticos. Quando precisa de cor explícita do novo token (ink/card/line), usa `style={{ color: 'var(--ink)' }}` ou class Tailwind arbitrary `text-[var(--ink)]`.
- **Sem emojis em texto narrativo**. Emojis OK como **ícones de UI**.

### Padrões de form

- **Layout vertical** (cima → baixo). Evitar 2-col mesmo quando "cabe".
- Cada campo tem `<label>` com:
  - tag UPPERCASE pequena (`text-xs uppercase tracking-[0.16em] text-primary`)
  - microcopy explicativa em `pv-muted`
  - contador `n/MAX` quando há limite
- Selects opacos (`<select>`) → trocar por **grid de cards radio** (`aria-pressed`, hover, active state):
  - Padrão estabelecido em `pages/new-request-page.tsx` (categoria + visibilidade) e `pages/new-group-page.tsx` (joinPolicy).
  - Cada card tem mark (`01`, `02` ou sigla `GR`/`PU`/`PR`) + título + descrição.
- Botão primário **full-width** ou pareado com Cancel `variant="secondary"`.
- Erro: `<p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">`.
- Info: igual mas `role="status"`.

### Skeletons

Usar `<span className="pv-shimmer h-X w-Y rounded">` em loops `[0,1,2,3].map()` antes de `data` chegar. Ver `pages/groups-page.tsx`.

### Validação client espelha backend

Sempre que houver validação no service Go, replicar como microcopy no frontend (ex.: pedido `title` 3-120, `body` 10-4000; grupo `name` 3-80, `description` ≤500). NÃO precisa replicar a checagem completa — só o helper text que ensina o usuário.

### Navegação por contexto

Sino de notificação navega via `subject_type`:
- `PRAYER_REQUEST` → `/requests/{id}`
- `FRIENDSHIP` → `/friends`
- `GROUP` → `/groups/{id}`

---

## 9. Anti-patterns / armadilhas conhecidas

- **Não use `PageShell` em landing/auth** (chama `/profile`, requer auth).
- **Não rode `git commit` automaticamente** — só quando o usuário pedir.
- **Não use `Co-Authored-By: Claude`** nos commits.
- **Não suponha live realtime**: o sistema usa polling. Mudar pra Supabase Realtime é uma escolha consciente, não default.
- **Não pule camadas** (handler → repo direto). Service é onde a validação vive.
- **Não esqueça `tradition` filter** ao escrever queries de feed.
- **Não esqueça `deleted_at IS NULL`** em listagens.
- **Quando reiniciar `make dev`**, sempre matar a porta 8080 antes (`go run` deixa zumbi).
- **Não criar arquivo `.md` novo** sem o usuário pedir explicitamente. Mas `CLAUDE.md`, `README.md` e `DEPLOY.md` podem ser atualizados livremente.
- **Não crie testes "para parecer profissional"** — o repo ainda não tem suite e adicionar testes é decisão de produto, não cleanup.
- **`vercel.json` na raiz**: `experimentalServices.<name>` rejeita `regions`. Pin de região vai em `backend/vercel.json` ou `frontend/vercel.json`.

---

## 10. Decisões de produto firmes (de sessões anteriores)

- **Logout cai em `/`** (landing), não `/auth`.
- **Menu**: Mural · Amigos · Novo Pedido · Grupos · Criar Grupo. (Removido: "Moderação", que era stub e a moderação real vive dentro do detalhe do grupo.)
- **`/groups`** = Meus grupos (lista). **`/groups/new`** = criação focada (separada).
- **Grupos `INVITE_ONLY`** têm o feed gateado por membership (não vaza pra autenticados quaisquer). `OPEN`/`REQUEST` permanecem públicos a autenticados.
- **Moderator pode remover member** (rank-based), mas **não pode mudar papéis** (só admin).
- **Self-action protegida**: ninguém remove a si mesmo via `RemoveMember`; usar `Leave`.
- **Último admin** não pode ser removido nem rebaixado nem sair (ErrLastAdmin).
- **Notificações são best-effort** — uma falha de insert não derruba a ação que originaria.

---

## 11. Onde está o quê (cheat sheet)

| Quero mexer em… | Arquivos |
|---|---|
| Layout autenticado (header + nav) | `frontend/src/components/page-shell.tsx` |
| Landing pública | `frontend/src/pages/landing-page.tsx` + `app/route-guards.tsx` |
| Auth (signin/signup/passwordless/reset) | `frontend/src/pages/auth-page.tsx` |
| Tema/tokens | `frontend/src/index.css` |
| Detalhe de grupo (mural/membros/solicitações/settings) | `frontend/src/pages/group-page.tsx` |
| Criar pedido | `frontend/src/pages/new-request-page.tsx` |
| Criar grupo | `frontend/src/pages/new-group-page.tsx` |
| Lista de grupos | `frontend/src/pages/groups-page.tsx` |
| Sino de notificações | `frontend/src/components/notification-bell.tsx` |
| Rotas backend | `backend/internal/http/router.go` |
| Validações de domínio | `backend/internal/services/service.go` |
| SQL | `backend/internal/repositories/repository.go` |
| Schema | `backend/internal/db/migrations/*.sql` |
| Modelos / enums | `backend/internal/models/models.go` |

---

## 12. Roadmap (alto nível)

- **Phase 0 (DONE)**: setup, arquitetura, Supabase baseline, migrations.
- **Phase 1 (IN PROGRESS)**: Auth UI, perfil, grupos com aprovação, pedidos com prayed-action, amigos por @, feeds segmentados, notificações in-app (5 eventos).
- **Phase 2 (PLANNED)**: moderação completa (approve/reject/request-changes/remove/ban + audit), notificações por e-mail, busca + paginação universais.
- **Phase 3 (PLANNED)**: comentários moderados, controles avançados de privacidade, analytics de grupo, export/deletion (LGPD).

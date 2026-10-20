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
- **Deploy**: Vercel (`experimentalServices` — frontend `vite` + backend Go) com a função em `pdx1` (perto do Supabase em `us-west-2`), configurada no **painel da Vercel** (Settings → Functions → Function Region)

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
  vercel.json               # regions (ignorado pelo experimentalServices; vale o painel)
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
- Códigos comuns: `INVALID_JSON`, `INVALID_ID` (param de rota que não é UUID, via `middleware.UUIDParams` — novo param de ID precisa entrar em `uuidParamNames`), `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND` (com sufixo do recurso, ex.: `GROUP_NOT_FOUND`), `LAST_ADMIN`, `INTERNAL_ERROR`, `USER_SYNC_FAILED`.

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
- Eventos suportados (lista completa em `models.go`, `NotificationType*`): `PRAYED`, `FRIEND_REQUEST_RECEIVED`, `FRIEND_REQUEST_ACCEPTED`, `GROUP_JOIN_APPROVED`, `GROUP_JOIN_REQUESTED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_CHANGES_ASKED`, `REQUEST_UPDATED`, `REQUEST_ANSWERED`, `GROUP_ANNOUNCEMENT_POSTED`, `MILESTONE_PRAYED`, `MILESTONE_CREATED`, `MILESTONE_STREAK`, `VERSE_SHARE_PRAYED`.
- `subject_type ∈ {PRAYER_REQUEST, FRIENDSHIP, GROUP, MILESTONE, VERSE_SHARE}` — `subject_id` permite o front navegar.
- **Contadores do shell** (`GET /notifications/unread-count` → `{ count, friendRequests }`): um statement só (`notificationSummarySQL`), porque o shell faz polling a cada 30 s. `friendRequests` conta pedidos recebidos pendentes, independente de a notificação ter sido lida. `GET /notifications` devolve os mesmos dois números no mesmo batch da página.
- **`friendRequestStatus`** (`PENDING | ACCEPTED | GONE`) vem só em `FRIEND_REQUEST_RECEIVED`, via `LEFT JOIN friendships` na listagem. Recusar/cancelar apaga a linha de `friendships`, daí `GONE`.
- **Aceitar/recusar pedido marca a notificação dele como lida** na mesma CTE (`markFriendRequestNotificationReadSQL`). Qualquer ação nova que "resolva" o assunto de uma notificação deve fazer o mesmo, senão o badge fica aceso sem motivo.

### Amigos (`GET /friends`)

Cada amigo vem com `bio`, `mutualFriends`, `sharedGroups` e `latestRequest` (id, título, data, orações) — tudo no mesmo statement (`listFriendsSQL`), sem viagem extra. `latestRequest` passa por `prayerRequestVisibleTo(viewer)` **e** exclui `allow_anonymous = true`: mostrar um pedido anônimo no card revelaria a autoria. A sidebar (`['friends','shell']`) lê o mesmo endpoint. Sugestões vêm de `GET /users/suggested`.

### Performance de feed (convenções)

- **Feeds mesclados** (home, groups, friends, público, mural do grupo) buscam `limit+offset` linhas **cruas** de cada stream, mesclam/fatiam no service e só então enriquecem a página final via `enrichFeedPage`. Não voltar a enriquecer dentro de `ListHomePrayerRequests`/`ListGroupsPrayerRequests`/`ListPrayerRequestsByGroup`/`List*VerseShares`.
- `mergeFeedItems(streams ...[]models.FeedItem)` é **variádico** — hoje recebe pedidos, avisos e versículos. Um tipo novo de item entra como mais um stream, não como mais um parâmetro posicional.
- **COUNTs de feed** passam por `Service.cachedCount` (TTL 30s, `feedCountTTL`). Novos counts de feed devem usar o mesmo helper.
- `prayer_actions` tem índice `(prayer_request_id, action_type)` (migration 000016) para a agregação de reações do enrich — preservar esse padrão de acesso.
- Feed público **anônimo** responde `Cache-Control: s-maxage=30` (CDN). Não adicionar cache em resposta autenticada sem `Vary`/cuidado.

### Orçamento de round trips (regra de performance)

**O gargalo deste backend é a quantidade de idas ao banco, não a duração das
queries.** Medido contra o Supabase: um round trip custa ~200 ms de uma máquina
no Brasil, e 50 statements numa única mensagem custam o mesmo que 1. Com o
volume atual (poucas dezenas de linhas por tabela) o tempo de execução é
desprezível — o que se paga é a viagem.

Consequência prática: **antes de otimizar qualquer coisa, conte viagens.** O log
de cada requisição traz `dbRoundTrips` e `dbStatements` (tracer em
`internal/db/trace.go`, plugado em `poolCfg.ConnConfig.Tracer`). Um batch conta
como **uma** viagem de propósito — é exatamente essa a diferença que interessa.

Duas ferramentas, cada uma no seu lugar:

- **`pgx.Batch` quando as consultas já estão no mesmo método do repositório.**
  Colapsa N viagens em 1 usando **uma** conexão. É a primeira escolha. Helper:
  `nextBatchRows` consome os resultados na ordem em que foram enfileirados.
  Já aplicado em `EnrichPrayerRequests`, `EnrichVerseShares`, `GetUserStats`,
  `ListModerationHistory`, `ListPrayerActionsByRequest`,
  `ListPrayerRequestUpdates`, `ListVerseShareActions` (checagem de acesso + lista
  no mesmo batch) e nos efeitos colaterais das reações.
- **CTE de escrita quando o resultado de uma escrita depende de leituras.** A
  reação (`reactionSQL`) resolve tradição, tipo padrão, visibilidade, dedupe,
  insert e contador num statement só, e devolve flags para o Go escolher o erro.
- **`errgroup` quando as chamadas cruzam métodos do repositório** (os feeds
  mesclados). Sempre via `runBounded`, **nunca** `errgroup` cru: o limite de
  `maxParallelQueries = 3` existe porque `DB_MAX_CONNS` é 8 para o processo
  inteiro. Sem trava, um fanout de seis numa requisição consumiria quase o pool
  todo e a latência pioraria sob carga.

Outras regras que saíram dessa medição:

- **Não enriquecer duas vezes.** Os `List*` do repositório usados por feed
  mesclado devolvem linhas **cruas**; quem enriquece é o `enrichFeedPage`, na
  página final. `ListPublicPrayerRequests` e `ListFriendsPrayerRequests` já
  enriqueceram internamente por um tempo e isso dobrava o custo do feed.
- **Notificação resolvida em SQL.** Descobrir o autor, checar a janela de dedupe
  e inserir eram três viagens; hoje é um `INSERT ... SELECT` só, com o
  `author_id <> actor` evitando auto-notificação e o `NOT EXISTS` aplicando os
  60 minutos.
- **Trabalho em background não é opção neste deploy.** A tentação seria
  responder na hora e deixar notificação/milestone para uma goroutine, mas a
  função da Vercel congela depois da resposta e o trabalho morreria pela metade.
  Por isso a cauda foi **agrupada**, não jogada para trás.
- **`ensureAuthUser` tem cache de 60 s** (`ttlSeen` em `service.go`), chaveado
  pelos dados do token e não só pelo id — se algo muda no Supabase, sincroniza
  na hora. Sem isso era uma viagem extra em toda requisição autenticada.
- **Índice ainda não vale a pena.** Com poucas dezenas de linhas o planner
  ignora qualquer índice. Trabalho de índice só faz sentido depois de semear um
  dataset representativo; até lá, otimize viagens.

Números da passagem de otimização (medidos com round trip de ~200 ms):

| caminho | antes | depois |
|---|---|---|
| `ListFriendsFeed` | 4189 ms | 430 ms |
| `ListGroupsFeed` | 2920 ms | 415 ms |
| `ListHomeFeed` | 2502 ms | 421 ms |
| `ListPublicFeed` | 2256 ms | 411 ms |
| `ListGroupFeed` | 1839 ms | 617 ms |
| `GetUserStats` | 1164 ms | 207 ms |

| `RecordPrayerAction` | 5–7 viagens | 2 viagens |
| `RecordVerseShareAction` | 7–9 viagens | 2 viagens |

As reações são **duas viagens fixas**: (1) o statement que decide e grava e (2)
um batch best-effort com notificação ao autor + marcos `MILESTONE_PRAYED` e
`MILESTONE_STREAK`, ambos resolvidos em SQL (`prayedMilestoneSQL`,
`streakMilestoneSQL`). Não dá para fundir as duas: o efeito colateral precisa
da reação confirmada, e uma falha nele não pode desfazê-la.

### Visibilidade por ID (predicados canônicos)

`prayerRequestVisibleTo(viewer)` e `verseShareVisibleTo(viewer)` em
`repository.go` são **a** regra de "o viewer enxerga este conteúdo". Detalhe,
reações, "quem rezou", atualizações e checagens de autoria usam o mesmo texto —
não reescreva a regra numa query nova, concatene o fragmento.

- Autor sempre vê o próprio conteúdo (inclusive `PENDING_REVIEW`/`PRIVATE` e
  depois de trocar de tradição).
- Demais: `deleted_at IS NULL`, mesma tradição, sem `user_blocks` em nenhuma
  direção, e a regra de visibilidade do tipo.
- Invisível responde **404**, nunca 403, para não revelar existência.
- Quem só precisa decidir permissão usa `GetPrayerRequestAccess` (uma viagem,
  sem enrich), não `GetPrayerRequestByID` (duas).

### Existência antes de permissão

`GetGroupRoleOf` e `isGroupAdmin` partem de `groups` com `LEFT JOIN` na
membership: grupo inexistente vira `ErrGroupNotFound` (404) na mesma viagem que
descobre o papel. Handler de rota `/groups/{id}/...` precisa mapear
`ErrGroupNotFound`. Recurso aninhado (aviso, solicitação) precisa pertencer ao
pai da URL — `announcementInGroup` devolve 404 se o aviso é de outro grupo.

### Versículo do dia (`bible_verses` / `verse_shares`)

Terceiro tipo de conteúdo do feed, ao lado de pedidos e avisos.

- **Catálogo curado** em `bible_verses` (migration 000019): 312 linhas de
  *referência + tema + tradição*. A curadoria vive no banco porque nenhuma API
  pública sabe responder "um versículo sobre esperança" — elas só resolvem
  referência → texto.
- **Texto hidratado sob demanda**: `bible_verses.text` nasce `NULL` e é
  preenchido na primeira leitura pelo `internal/bible.TextProvider` (HTTP contra
  `bible-api.com`, tradução `almeida`, domínio público), depois persistido. A
  API sai do caminho quente. Falha do provider **nunca** propaga: o endpoint
  responde 200 com texto vazio e o front mostra só a referência.
  Os deuterocanônicos já vêm com texto semeado — as traduções pt-BR gratuitas
  servem só o cânon protestante e nunca conseguiriam hidratá-los.
- **Fallback de texto**: a tradução `almeida` do bible-api.com tem buracos (ex.:
  `ephesians 2:14` responde 404). `resolveVerseWithText` caminha até 4 vizinhos
  do pool, de forma determinística, até achar um versículo com texto — assim uma
  referência que a API não resolve nunca vira um card em branco. Esgotadas as
  tentativas, devolve o primeiro candidato mesmo sem texto.
  ⚠️ O catálogo de 300 referências **não foi validado inteiro** contra a API:
  a varredura derrubou o IP no rate-limit (15 req/30s) e ficou incompleta. Se
  for refazer, serial e com ~2s entre chamadas.
- **Seleção determinística**: `dailyVerseOffset(userID, dia, poolSize)` =
  `fnv64a(userID + "|" + YYYY-MM-DD) % poolSize`, com o dia no fuso de São Paulo
  (`time/tzdata` importada em `main.go` porque a Vercel não garante a base de
  fusos). Não existe cron no backend — a escolha precisa ser recomputável a cada
  request. **Se mudar o `ORDER BY id` de `GetVerseByPoolOffset`, o versículo de
  todo mundo muda.**
- **Visibilidade** usa enum próprio `verse_share_visibility`
  (`PUBLIC | FRIENDS | GROUP_ONLY | PRIVATE`) — `FRIENDS` não existe em
  `prayer_visibility`. `verseShareVisibleTo` é o predicado canônico; os streams de
  feed repetem os mesmos invariantes (tradição, `deleted_at IS NULL`,
  `user_blocks` nas duas direções, `PRIVATE` só para o autor).
- **Reações reusam `prayer_actions`**, que virou polimórfica na migration 000020:
  `prayer_request_id` agora é nullable, existe `verse_share_id`, e um CHECK
  garante exatamente um dos dois. Nenhuma query antiga precisou mudar (todas
  filtram `prayer_request_id = ...`, e `NULL` nunca casa). Isso mantém
  `ProfileStats.PrayerActionsTotal` contando tudo num lugar só.
- `verse_shares` **não tem contador desnormalizado**: `prayedCount` é somado no
  enrich a partir das próprias reações, então não há contador para dessincronizar.

### Tradition (catolica/evangélica)

`prayer_requests.tradition` filtra feeds para o `tradition` do viewer (ver SQL em `ListPrayerRequestsByGroup`, etc). **Se mexer em query de feed, preserve esse filtro.**

### Documentação da API (`/docs`)

O backend serve uma Swagger UI em `/docs`: `http://localhost:8080/docs` no local e `https://<domínio>/_/backend/docs` em produção. Ela lê `internal/http/apidocs/openapi.yaml`, escrito à mão e embutido no binário com `go:embed`. Um QA testa a API por ela.

- **Mudou rota, payload, validação ou código de erro? Atualize o `openapi.yaml` no mesmo commit.** Nada gera o spec a partir do código, então ele envelhece calado.
- Os códigos de erro documentados devem ser só os que o handler **realmente** emite (`errors.Is` → `shared.WriteError`). Quando o comportamento é estranho (ex.: um 500 onde caberia 404), documente com ⚠️ em vez de inventar o ideal.
- `servers` usa a URL relativa `../api/v1`, resolvida contra o próprio spec. Isso funciona sem config nos dois ambientes, com e sem `/_/backend`. Não troque por URL absoluta.
- Para conferir: `npx @redocly/cli lint backend/internal/http/apidocs/openapi.yaml`. Os avisos de `operationId` e de descrição de tag são esperados.

### Segurança

- **RLS em toda tabela de `public`** (migration 000021). O backend fala como
  `postgres` (dono das tabelas, `BYPASSRLS`), então RLS sem policy não muda nada
  para ele. Quem perde acesso é o PostgREST, que a anon key do bundle alcança;
  antes disso qualquer um lia `users.email` direto. **Toda migration que cria
  tabela precisa de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.** Os grants de
  `anon`/`authenticated` foram revogados, inclusive os padrões futuros.
- Função usada por policy de Storage precisa ser `SECURITY DEFINER` com
  `SET search_path = public` (ex.: `is_group_admin_or_moderator`), senão ela
  roda como `authenticated` e não enxerga mais a tabela.
- **JWT** (`internal/auth/jwks.go`): exige `aud` e `role` = `authenticated`,
  `exp`, algoritmo `ES256`/`RS256` e 30 s de leeway. Token sem `kid` só passa
  com uma chave no JWKS. `kid` desconhecido força refresh no máximo 1 vez a
  cada 30 s.
- **Middlewares**: `SecurityHeaders` (nosniff, frame DENY, `no-referrer`, CSP
  `default-src 'none'` fora de `/docs`), `BodyLimit` de 64 KB no `/api/v1`
  (estouro vira `INVALID_JSON`), `X-Request-Id` do cliente só no formato
  `^[A-Za-z0-9-]{1,64}$`, e `WriteRateLimit` (30 escritas/min por usuário →
  `429 RATE_LIMITED`). O rate limit vive na memória da instância: na Vercel é
  melhor esforço. O freio de auth e e-mail é o do Supabase.
- **URLs de imagem** (`validImageURL` no service): avatar, capa e aviso só
  aceitam `https://<ref>.supabase.co/storage/v1/object/public/...` ou vazio. A
  origem sai do `JWT_ISSUER` (`cfg.SupabaseURL`). Front que reenvia o formulário
  inteiro deve mandar a imagem só quando ela mudou, porque URL antiga de fora
  travaria o salvamento.
- **Conta excluída** (`DELETE /me`): numa tx, soft delete + texto apagado do
  conteúdo, remoção de vínculos e anonimização de `users` (o e-mail vira
  `<id>@deleted.local` para liberar o UNIQUE). O usuário sai do Supabase Auth
  pela Admin API **antes do commit**: se a API falhar, nada é gravado. Único
  admin de grupo com membros → `409 LAST_ADMIN` com `details.groups`.
  `UpsertAuthUser` não revive linha com `deleted_at` (`ErrAccountDeleted` →
  `401 ACCOUNT_DELETED` via `writeAuthSyncError`), o que cobre o access token
  que ainda vale por até 1 h. Handler novo usa `writeAuthSyncError(w, err)` no
  erro de `ensureAuthUser`.
- **Export** (`GET /me/export`): um statement só (`exportUserDataSQL`, um
  `json_build_object`). Tabela nova com dado pessoal entra nele.
- Segredo novo do backend: `SUPABASE_SERVICE_ROLE_KEY`, usado só na exclusão.
  Sem ele, `503 ACCOUNT_DELETION_UNAVAILABLE`.

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

- **`/`** (`pages/landing-page.tsx` + `components/landing/`) — landing de marketing que **mostra** o produto: nav sticky com âncoras, hero com mockup vivo (`hero-demo.tsx`: pedido recebendo orações, notificações, versículo; pausa fora da tela e com reduced motion), pilares, "Como funciona" com mockup sticky trocado pelo scroll (`how-it-works.tsx`), playground de reações/tradição e diagrama de privacidade (`playground.tsx`), bento de recursos, FAQ e CTA final. Tudo fictício (`demo-data.ts`), sem API; as pílulas usam `prayerActionsFor` e a marcação `.rx` do feed, então a vitrine não desatualiza. **Auth não fica na página**: `Entrar`/`Criar conta` abrem `<AuthDialog>` (gaveta à direita, tela cheia ≤640px) com o `<AuthCard>`, que concentra todo o fluxo (senha, link mágico, cadastro, reenvio, captcha). `/?auth=entrar|criar` abre o painel direto. A tradição clicada no playground pré-seleciona o cadastro (só se o visitante clicou). Sign-in bem-sucedido roteia pra `/feed`. A landing está no bundle inicial: não importar `feed-card` ou outras peças pesadas nela. Classes `.lp-*`; `.welcome__auth-card` e cia. seguem servindo também `/auth` e `/auth/reset`.
- **`/auth`** (`pages/auth-page.tsx`) — usado por callbacks de email/reset; não é a entrada principal mais. (O onboarding wizard foi **removido** — não existe `/onboarding`.) Verifica `?token_hash=&type=` (confirmação de cadastro, link mágico, troca de e-mail) com `verifyOtp`.
- **Auth e segurança da conta**:
  - E-mail precisa ser confirmado (painel do Supabase). Login recusado por "Email not confirmed" oferece reenvio na hora, com cooldown de 60 s (`useCooldown`).
  - Templates de e-mail (`supabase/templates/`) usam `token_hash`, não o `ConfirmationURL` PKCE, para o link abrir em qualquer navegador.
  - **`/auth/reset` só libera a troca vindo de um link de recuperação**: `token_hash` com `type=recovery`, ou a flag `creo-recovery` em `sessionStorage`, gravada pelo listener de `PASSWORD_RECOVERY` em `lib/supabase.ts` (o evento dispara antes da página montar). Depois de salvar: `signOut({ scope: 'others' })`.
  - **Senha mínima única**: `PASSWORD_MIN` em `lib/password.ts` (8), igual ao painel do Supabase.
  - **Captcha**: `useCaptcha()` + `<TurnstileWidget>` + `captchaOption(token)` (`components/turnstile.tsx`) em toda chamada de auth que o Supabase protege (`signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail`, `resend`). O token é de uso único: `captcha.reset()` no `finally`. Sem `VITE_TURNSTILE_SITE_KEY`, o widget não aparece (dev).
  - **Perfil → Conta** (`components/account-security.tsx`): trocar senha (reconfere a atual com `signInWithPassword`), trocar e-mail (`updateUser`, confirmação dupla), sair deste ou de todos os dispositivos (`signOut({ scope: 'global' })`), exportar dados e excluir conta (senha atual + digitar o `@username`).
  - `lib/api.ts`: refresh que falha ou `ACCOUNT_DELETED` faz `signOut({ scope: 'local' })`, senão o `getSession()` devolvia o token morto de novo.
- **`/feed`** (`pages/feed-page.tsx`) — canvas `.feed` 720px, headline serif, tabs com `tabs__ink`, composer quiet (abre modal global), posts.
- **`/requests/:id`** (`pages/request-detail-page.tsx`) — IntentionDetail editorial: header + body em serif, total de orações destacado, reactions row, "Quem rezou" agrupado, "Atualizações do autor" (**funcional**: `GET/POST /requests/:id/updates`), marcar como atendido com testemunho (`POST/DELETE /requests/:id/answer`), "Compartilhar com" (PATCH /requests/:id — visibilidade por grupo, não é share externo).
- **`/notifications`** (`pages/notifications-page.tsx`) — pedidos de amizade pendentes fixados no topo (Aceitar/Recusar inline) e o resto em ordem **cronológica**, em faixas Novas / Hoje / Anteriores (não agrupar por tipo: um pedido de amizade ficava enterrado abaixo das orações).
- **Sino** (`components/notification-bell.tsx`): no desktop abre um **painel** (`.npanel`, z 45) com pedidos pendentes + últimas notificações + "Ver todas"; ≤900px navega para `/notifications`. Contadores são `<CountBadge>` numéricos (sino, "Notificações" e "Amigos" na sidebar e na tabbar), e o título da aba vira `(N) Creo`. Tudo lê `useNotificationSummary()` (`lib/use-notifications.ts`, chave `['notifications','unread-count']`) — não criar outra query de contador.
- **Pedido de amizade** tem uma só implementação de ações: `useFriendRequestActions()` + `<FriendRequestRow>`, usados no painel, em `/notifications`, em `/friends` e na faixa do mural (`<FriendRequestBanner>`).
- **`/groups`, `/groups/:id`, `/profile`, `/u/:username`, `/friends`, `/moderation`, `/groups/:id/announcements/*`** — visual existente, retokenizado pelos aliases.

### Componentes-chave

- `components/page-shell.tsx` — `.app` grid (sidebar 248px + stage). Sidebar tem brand + nav (Mural, Notificações, Amigos, Grupos, Criar grupo) + "Em oração agora" (top friends do `/friends`) + `side__me` no rodapé. Topbar com search pill + **botão "+ Nova intenção"** (`btn btn--ghost-out top__compose`) + sino com painel (`<NotificationBell>`).
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
- **Páginas que não são feed** (Amigos, Grupos, Criar grupo, Aviso, Moderação) usam `<main className="canvas">` (720px; `canvas--wide` = 1040px para form + prévia). Blocos prontos: `.canvas__h`/`.canvas__count` (título de seção), `.canvas__empty*`, `.canvas__alert`/`.canvas__status` (substituem o `<p role="alert">` com `border-primary`), `.menu-pop` (menu de card, z 45), `.btn--sm`.
- **Formulários de página**: `.form` › `.field` (`.field__label` + `.field__hint`, `.field__count[--over]`, `.field__control` em `input`/`textarea`, `.field__help`) e `.choice-grid` › `.choice[aria-pressed]` (`.choice__mark/__title/__desc`) no lugar dos cards-radio em Tailwind; `.form-foot` com ações à direita. O modal de nova intenção ainda usa o padrão antigo.
- **Listas de pessoas**: `.plist` › `.prow` (membros, solicitações de grupo), `.req` (pedidos de amizade), `.friend-card` (grade de amigos; o link do nome cobre o card via `::after`, intenção e menu ficam por cima com `z-index: 1`), `.role-pill--{admin|moderator|member}`, `.policy-pill`.
- **Grupo**: `<GroupMark>` (`components/group-mark.tsx`) é a marca quadrada com tom oklch por hash do nome; `groupTone()` também pinta a capa sem imagem. Header em `.ghead*`, abas em `.tabs.tabs--group` (`--tab-w` 128px; rola no mobile).
- **Auth fora da landing** (`/auth`, `/auth/reset`): `.auth-solo` reusa o `.welcome__auth-card` da landing, sem hero.
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

### Animação (`motion`)

- Lib **`motion`** (import de `motion/react`), carregada via `<LazyMotion features={domMax} strict>` em `app/providers.tsx`. **Use sempre `m.*`, nunca `motion.*`** — o `strict` quebra em dev se alguém usar. `domMax` (e não `domAnimation`) porque toasts e listas usam animação de `layout`. Vai num chunk próprio `motion` (`vite.config.ts`), ~48 KB gzip (a landing usa `useScroll`/`useInView`/`useSpring`).
- Presets em `lib/motion.ts`: `ease` (a mesma curva `.2,.7,.2,1` do CSS), `duration`, `fadeUp`, `popIn`, `fade`, `springSoft`, `stagger(i)`. Movimento sóbrio: 120–400 ms, sem bounce forte e sem loop decorativo.
- **Reduced motion**: `<MotionConfig reducedMotion="user">` cobre o JS; o bloco `@media (prefers-reduced-motion: reduce)` no fim do `index.css` cobre os keyframes CSS. Animação nova em CSS já herda; em JS, via `m.*`, também.
- Padrões prontos:
  - **Lista**: `MotionItem` + `useSettledKey` (`components/motion-list.tsx`) dentro de `<AnimatePresence mode="popLayout">` — entra escalonado, desliza no layout e encolhe ao sair. O container precisa de `position: relative` (o `popLayout` posiciona quem sai em absoluto). `useSettledKey` impede que `keepPreviousData` anime a entrada dos itens velhos.
  - **Número**: `<CountUp value>` (`components/count-up.tsx`) conta só na mudança, nunca no mount.
  - **Overlay com saída** (modal, menu, sheet): `<AnimatePresence>{open && <m.div variants={popIn} initial="hidden" animate="show" exit="exit">}</AnimatePresence>`. Não voltar a usar `if (!open) return null` — isso mata a saída. `.modal`/`.modal-veil` não têm mais `animation` CSS.
  - **Rota**: o `<main>` do `PageShell` é `m.main key={pathname}` (só entrada; cada página monta o próprio shell).
- Reações (`rxPop`/burst) e `.tabs__ink` continuam em CSS de propósito.

### Skeletons

Usar `<span className="pv-shimmer h-X w-Y rounded">` em loops `[0,1,2,3].map()` antes de `data` chegar. Ver `pages/groups-page.tsx`.

### Analytics

Vercel Web Analytics (`@vercel/analytics/react`, **não** `/next` — o app é Vite), montado em `main.tsx` ao lado do `RouterProvider`. Não usa cookie. Pageviews passam por `anonymizeAnalyticsEvent` (`lib/analytics.ts`), que troca segmentos dinâmicos pelo nome do parâmetro (`/u/:username`, `/requests/:id`, …) e descarta a query string. **Rota dinâmica nova em `router.tsx` precisa entrar em `DYNAMIC_ROUTES`**, senão IDs e @usernames vazam para o painel.

### Validação client espelha backend

Sempre que houver validação no service Go, replicar como microcopy no frontend (ex.: pedido `title` 3-120, `body` 10-4000; grupo `name` 3-80, `description` ≤500). NÃO precisa replicar a checagem completa — só o helper text que ensina o usuário.

### Navegação por contexto

Notificação navega via `subject_type` (`targetPath` em `lib/notifications.ts`):
- `PRAYER_REQUEST` → `/requests/{id}`
- `FRIENDSHIP` → `/friends` se o pedido está pendente; senão `/u/{actor}`
- `GROUP` → `/groups/{id}`
- `VERSE_SHARE` → `/verses/{id}`

---

## 9. Anti-patterns / armadilhas conhecidas

- **Não use `PageShell` em landing/auth** (chama `/profile`, requer auth).
- **Não rode `git commit` automaticamente** — só quando o usuário pedir.
- **Não use `Co-Authored-By: Claude`** nos commits.
- **Não suponha live realtime**: o sistema usa polling. Mudar pra Supabase Realtime é uma escolha consciente, não default.
- **Não pule camadas** (handler → repo direto). Service é onde a validação vive.
- **Não esqueça `tradition` filter** ao escrever queries de feed.
- **Não esqueça `deleted_at IS NULL`** em listagens.
- **Não esqueça o `openapi.yaml`** ao criar ou alterar endpoint.
- **Não crie tabela sem `ENABLE ROW LEVEL SECURITY`** — a anon key é pública.
- **Não ligue o captcha no Supabase antes** de o front com `VITE_TURNSTILE_SITE_KEY` estar no ar: todo login quebra.
- **Quando reiniciar `make dev`**, sempre matar a porta 8080 antes (`go run` deixa zumbi).
- **Não criar arquivo `.md` novo** sem o usuário pedir explicitamente. Mas `CLAUDE.md`, `README.md` e `DEPLOY.md` podem ser atualizados livremente.
- **Não crie testes "para parecer profissional"** — o repo ainda não tem suite e adicionar testes é decisão de produto, não cleanup.
- **`framework: "go"` no service `backend`** (`vercel.json` da raiz): `backend/` tem `go.mod` **e** um `Dockerfile`, e o Vercel CLI 62+ detecta os dois (Go e Container) e recusa o build com "Multiple frameworks detected". Não remova o pin. A chave `experimentalServices` está depreciada (migrar para `services` + `rewrites` é uma mudança de roteamento à parte).
- **Região da função**: `experimentalServices.<name>` rejeita `regions`, e o `regions` em `backend/vercel.json` é **ignorado** — a função estava rodando em `iad1`, com ~60 ms por ida ao Supabase. A região vale pelo painel da Vercel (Settings → Functions → Function Region). Para conferir: o header `x-vercel-id` da resposta deve ser `gru1::pdx1::...` (borda::função), e o `Server-Timing` mostra `app`/`db`/idas ao banco por request.

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
| Landing pública | `frontend/src/pages/landing-page.tsx` + `components/landing/*` + `app/route-guards.tsx` |
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
| Documentação da API (Swagger) | `backend/internal/http/apidocs/openapi.yaml` + `docs.go` + `index.html` |
| Documentação técnica para devs (em inglês: arquitetura, banco, decisões) | `docs/technical/` (índice em `docs/technical/README.md`) |
| Instrumentação de banco | `backend/internal/db/trace.go` + `internal/http/middleware/logging.go` |
| Segurança da conta (front) | `frontend/src/components/account-security.tsx`, `components/turnstile.tsx`, `lib/password.ts`, `pages/auth-reset-page.tsx` |
| LGPD (export/exclusão) | `backend/internal/repositories/account.go` + `handlers/account_handler.go` + `internal/supabaseadmin` |
| Templates de e-mail | `supabase/templates/*.html` (colar no painel do Supabase) |
| Versículo do dia (backend) | `backend/internal/bible/bible.go` + `verse_handler.go` + seção de versículos em `service.go`/`repository.go` |
| Versículo do dia (frontend) | `frontend/src/components/daily-verse.tsx`, `share-verse-modal.tsx`, `VerseCard` em `feed-card.tsx` |

---

## 12. Roadmap (alto nível)

- **Phase 0 (DONE)**: setup, arquitetura, Supabase baseline, migrations.
- **Phase 1 (IN PROGRESS)**: Auth UI, perfil, grupos com aprovação, pedidos com prayed-action, amigos por @, feeds segmentados, notificações in-app (5 eventos).
- **Phase 2 (PLANNED)**: moderação completa (approve/reject/request-changes/remove/ban + audit), notificações por e-mail, busca + paginação universais.
- **Phase 3 (PLANNED)**: comentários moderados, controles avançados de privacidade, analytics de grupo, export/deletion (LGPD).

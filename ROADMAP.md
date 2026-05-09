# Roadmap pós-redesign

Estado em 2026-05-09. Phase 1 (editorial cream + ink) e Phase 2 (telas novas:
IntentionDetail, NotificationsPage, Welcome, Onboarding) entregues. Profile
recebeu o header editorial e o composer ganhou o shell `.modal*`.

A fila abaixo organiza o que ficou de fora — quase tudo backend ou polish
visual de segunda passada — em rodadas independentes que podem ser tocadas
em qualquer ordem.

---

## Rodada A — Backend de IntentionDetail

Destrava as duas seções que hoje aparecem como placeholder (`Quem rezou` mostra
contadores e `Atualizações do autor` mostra "Em breve").

### A.1 — `GET /requests/:id/actions`

- Endpoint novo retornando lista de prayer_actions agrupada por usuário e tipo.
  Backend já tem a tabela `prayer_actions(user_id, request_id, action_type, created_at)`.
- Política de privacidade a definir antes de codar:
  - **Opção 1**: nomes só pra autor do pedido.
  - **Opção 2**: nomes pra todo mundo (já hoje é público quem rezou, só não tem UI).
  - **Opção 3**: nomes pra amigos do autor + autor.
- Frontend já tem o slot pronto em `IntentionDetail` — substituir o
  `<span className="prayed-pill prayed-pill--more">N pessoas</span>` pela lista
  real de nomes em chips.

### A.2 — Updates do autor

- Tabela `prayer_request_updates(id, request_id, author_id, body, created_at)` já
  existe no schema (visto em `000001_init.up.sql`).
- Falta:
  - `POST /requests/:id/updates` — service valida que `actor == author`, body 1-2000.
  - `GET /requests/:id/updates` — lista paginada por `created_at DESC`.
  - Notificação `UPDATE` pra todo mundo que rezou no pedido (best-effort, padrão
    igual ao `notifyGroupMembersOfAnnouncement`).
- Frontend: trocar o "Em breve" no `IntentionDetail` por modal pequeno que abre
  ao clicar `+ Adicionar atualização`.

---

## Rodada B — Stats expandidas no perfil

Hoje `Profile.stats` retorna só `requestsCreated` e `prayerActionsTotal`. O
header novo tem 4 quadros que ficam com `—`:

- `orações enviadas` — já temos (`prayerActionsTotal`).
- `orações recebidas` — somar prayer_actions onde request.author = userID. Novo
  campo no service.
- `intenções compartilhadas` — já temos (`requestsCreated`).
- `dias consecutivos` — calcular streak de dias com pelo menos 1 prayer_action
  do usuário. Query mais cara — considerar materializar num campo no `users` ou
  cron diário.

Frontend: trocar os 4 `—` em `profile-page.tsx` pelos valores reais; idem pro
public-profile quando o viewer tem acesso.

---

## Rodada C — Notificações expandidas

Backend hoje emite `PRAYED`, `FRIEND_REQUEST_*`, `GROUP_*` e `REQUEST_*`. A
NotificationsPage tem buckets `prayed`, `follow`, `group`, `outros`. Faltam:

- **`UPDATE`** — quando autor de pedido publica uma atualização (ver A.2).
  Bucket "Atualizações de intenções" no UI.
- **`MILESTONE`** — gamificação tipo "100 orações enviadas", "30 dias seguidos".
  Bucket "Marcos". Dispara quando o stat cruza um threshold. Pode esperar a
  rodada B pra ter dados.

---

## Rodada D — Friend suggestions

A step 3 do onboarding hoje mostra 6 nomes mockados. Pra produção:

- Endpoint `GET /users/suggested` que retorna até 10 usuários com algum sinal
  de relevância (amigos-de-amigos, mesma tradição, mesmo grupo). Algoritmo
  mínimo viável: top 10 usuários com mais grupos em comum + amigos em comum.
- Frontend: trocar `SUGGESTED_FRIENDS` em `onboarding-page.tsx` pela query real;
  click envia `POST /friends/requests` e mostra check imediato.
- "Amigos em comum" no public-profile atualmente vazio também consome a mesma
  lógica.

---

## Rodada E — Polish que sobrou

Visuais menores que ficaram pra trás:

- **`auth-page.tsx`** — segue com tokens cascateados mas sem o visual editorial.
  É a página atingida via "Esqueceu a senha?" e callbacks de email. Deveria ter
  pelo menos um header serif e o botão pill `.btn--primary`.
- **Profile editing** — o form de edit (nome, username, bio, tradição) ainda
  vive em painéis `pv-panel`. Estética inconsistente com o header editorial
  novo. Refatorar pra usar `.modal*` ou `.detail__section` blocks.
- **Group page settings tab** — segue com inputs grandes e botão genérico.
  Aplicar `.btn--ghost-out` no upload e `.cat-pill` nos seletores onde fizer
  sentido.
- **Mobile no onboarding** — testar se o `.onb__cards` 1-col no mobile não
  ficou apertado. Testar também a transição entre passos em viewport curto.
- **"Em oração agora" no sidebar** — hoje mostra top 4 amigos sem o pulse dot.
  Quando a rodada B trouxer streak, os amigos com streak ativa podem ganhar o
  dot animado.

---

## Rodada F — Backend pra IntentionDetail compartilhar

`Compartilhar com` no IntentionDetail funciona via `PATCH /requests/:id` com
`groupIds` adicionado. Ok pra autor. Considerar:

- Limitar quantos grupos cada pedido pode estar (ex.: 5) pra evitar spam.
- Quando o pedido sai de `visibility=PUBLIC` pra `GROUP_ONLY` via share, o
  service hoje pode rejeitar se o usuário não for membro — verificar.

---

## Não-pendências (decisões fechadas)

- **Tradições**: ficamos com 2 (Católico/Evangélico). Não vai entrar BOTH ou
  NONE no backend nem no UI.
- **PRAISE action type**: cancelado, mantemos os 5 católicos + 5 evangélicos
  existentes.
- **Dark theme**: dropado de vez — não tem retorno previsto.

---

## Ordem sugerida pra próxima sessão

Se for uma sessão só:

1. **Rodada A.1** (Quem rezou com nomes) — alto impacto visual no detail.
2. **Rodada B** (stats) — destrava o header de profile que tá com `—`.
3. **Rodada A.2** (updates) — fecha o IntentionDetail.

Se for duas sessões:

- Sessão 1: Rodadas A + B (frontend já tá pronto, é praticamente só backend).
- Sessão 2: Rodadas C + D + E (notif types + suggestions + polish).

Rodada F pode entrar como tarefa pequena em qualquer sessão.

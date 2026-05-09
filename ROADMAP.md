# Roadmap pós-redesign

Estado em 2026-05-09. As fases visuais (editorial cream + ink) e as duas
rodadas de backend (IntentionDetail, stats expandidas, friend suggestions,
milestones de count) estão entregues. O que segue é o que ficou aberto
depois disso.

---

## Concluído

- ✅ Phase 1 — paleta editorial, sidebar shell, reactions com glyph + oklch.
- ✅ Phase 2 — IntentionDetail, NotificationsPage, Welcome, Onboarding 6 passos.
- ✅ Profile + public profile com header editorial (cover band + 88px avatar overlap + grade de 4 stats).
- ✅ Composer modal envelopado em `.modal*`.
- ✅ Backend de IntentionDetail: `/requests/:id/actions` (Quem rezou com nomes), `/requests/:id/updates` (CRUD básico), `REQUEST_UPDATED` notif emitida pra quem rezou.
- ✅ Stats expandidas: `prayerActionsReceived` + `streakDays` (CTE em SP timezone) + `GET /profile/stats`.
- ✅ Friend suggestions: `GET /users/suggested` rankeado por mutual friends + grupos em comum, com reason em pt-BR.
- ✅ MILESTONE notifs (count-based): `MILESTONE_PRAYED` em [10, 50, 100, 500, 1000] e `MILESTONE_CREATED` em [1, 10, 50, 100], idempotentes por threshold-cross único.

---

## Pendências reais

### Visual / UX que ficou pela metade

- **Profile tabs (Ativas / Encerradas / Rezadas privadas / Linha do tempo)** — o redesign do perfil parou no header. O corpo da página segue com o form antigo de edição (nome/username/bio + tradição + bloqueados). As 4 abas previstas pelo design não foram construídas.
- **Profile form retoken** — o form de edit ainda usa `pv-panel`. Mistura padrões com o header editorial. Refatorar pra `.detail__section` ou modal seria coerente.
- **Auth-page** — deferido. Uso só pra callbacks e reset; Welcome cobre 99% do fluxo.
- **Group settings tab** — `Upload de foto`, selects e botões ainda em padrão antigo. Vale aplicar `.btn--ghost-out` no upload e `.cat-pill` nos selects onde fizer sentido.

### Funcionalidades incompletas

- **"Amigos em comum" no public profile** — o redesign tem essa seção mas hoje não renderiza nada. Precisa endpoint novo `GET /friends/mutual/:userId` (lista users que são amigos do viewer **e** do owner do perfil).
- **"Em oração agora" no sidebar** — hoje renderiza top 4 friends do `/friends`. Falta o dot verde animado e a noção real de "rezando agora", o que implica presence/activity feed (modelagem nova: tabela ou Redis com last-action timestamp).
- **MILESTONE de streak** — só implementei MILESTONE de count. Streak (7, 30, 100 dias consecutivos) precisaria de:
  - Cron diário que verifica streaks e emite `MILESTONE_STREAK`, ou
  - Trigger no first-action-of-day que recalcula streak e emite se cruzou threshold.
- **Rodada F: cap nos `groupIds` do compartilhar** — `IntentionDetail.Compartilhar com` chama `PATCH /requests/:id` sem limite de grupos. Vale capar em ~5 e validar que viewer é membro de todos os grupos novos no service.
- **PRAYED dedup** — várias orações em sequência geram várias notifs `PRAYED` pro autor. Boa hora de agrupar por (request, prayer) com cooldown de N min ou virar uma lista numa única notif.

### Mobile / acessibilidade não-testados

- **Onboarding viewport curto** — `.onb__h` com clamp(34, 5vw, 52) pode amassar em < 360px. Também testar transição entre passos com viewport curto.
- **Welcome em mobile** — colapso pra single-col abaixo de 1100px funciona, mas o auth card pode ficar curto demais quando o teclado abre. Validar.
- **ConfirmDialog focus** — não testado com leitor de tela. Importante porque é o único confirm de delete usado em vários lugares.

### Documentação / observabilidade

- **CLAUDE.md** ainda não menciona `/profile/stats`, `/users/suggested`, `/requests/:id/actions`, `/requests/:id/updates`, MILESTONE types — útil pra futuras sessões.
- **Logging** — milestones e updates emitem notif silenciosa. Quando algo falha no `insertNotificationOn`, vai pra log mas ninguém olha.

---

## Top 3 pra próxima rodada

1. **Profile tabs** — fecha o redesign do perfil. Frontend-only se decidirmos cada aba: Ativas/Encerradas usam `/requests` filtrado; Rezadas privadas precisa endpoint `GET /me/prayers` (novo, mas barato — equivalente do /actions invertido); Linha do tempo é placeholder até termos milestones.
2. **MILESTONE streak** — completa o sistema de marcos. A escolha entre cron e trigger é estrutural; ambas dão certo.
3. **PRAYED dedup** — silenciosamente o bug mais visível em produção. Cooldown de 60s na notif `PRAYED` por (recipient, request, actor) elimina spam sem mexer nas counts.

---

## Decisões fechadas (não-pendências)

- ❌ Tradition enum BOTH / NONE — decidido manter binário CATHOLIC | EVANGELICAL.
- ❌ PRAISE action type — decidido não criar; mantemos os 5 católicos + 5 evangélicos atuais.
- ❌ Dark theme — dropado e não volta.

---

## Próximas sessões sugeridas

Se uma sessão só:
- Top 3 acima. Profile tabs leva metade do tempo, milestones streak + PRAYED dedup são pequenos cada.

Se duas:
- **Sessão A**: Profile tabs + form retoken (tudo frontend, foco no perfil).
- **Sessão B**: MILESTONE streak + PRAYED dedup + cap de grupos (backend de polish).

Polish residual de auth/group settings e mobile-sweep podem entrar como tarefas pequenas em qualquer sessão.

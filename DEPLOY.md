# Deploy — Creo (Vercel multi-service)

Stack de produção:

```
Vercel Project (mono)
├── frontend  →  routePrefix "/"           (Vite SPA)
└── backend   →  routePrefix "/_/backend"  (Go/chi Web Service)
                       │
                       └── pgx ──▶  Supabase (Postgres + Auth)
```

Tudo é deployado num único projeto Vercel usando a feature **experimentalServices**. Frontend e backend ficam no mesmo domínio (zero CORS, mesma origem). O **banco continua no Supabase** — os serviços só consomem via env vars.

> **Aviso:** `experimentalServices` é marcado como experimental pela Vercel. Funciona, mas pode mudar sem aviso. Se o deploy quebrar por mudança da feature, o plano B é separar — ver seção "Plano B" no final.

---

## 0. Pré-requisitos

- Conta Vercel + CLI (`npm i -g vercel && vercel login`). Opcional — o fluxo via Git Import no dashboard também funciona.
- Acesso ao Supabase com:
  - `Project URL` (`https://<ref>.supabase.co`)
  - `anon public key`
  - `Connection string — Transaction pooler` (porta **6543**) → vira `DATABASE_URL` em produção
  - `Connection string — Direct` (porta **5432**) → só para rodar migrações da sua máquina
- Migrações: a versão em produção deve refletir a maior `NNNNNN_` em `backend/internal/db/migrations/` (confirme com `migrate ... version`).

---

## 1. Supabase — ajustes de produção

O domínio de produção é `https://www.creo.com.br` (`https://creo.com.br` redireciona para o `www`; `paroquiaviva.vercel.app` é o domínio da Vercel do mesmo deploy). Com ele:

1. **Auth → URL Configuration**
   - `Site URL` = `https://www.creo.com.br`
   - `Redirect URLs` = `https://www.creo.com.br/auth`, `https://www.creo.com.br/auth/reset` e `http://localhost:5173/**` (dev)
   - Sem isso, magic link e reset de senha falham. Os templates de e-mail montam o link a partir do `Site URL`, então um e-mail pedido em dev abre a produção — o link funciona do mesmo jeito (a sessão nasce lá), é só entrar de novo no localhost.

2. **Backups**: confira a retenção do seu plano. Free tier é curto.

3. **Migrações**:
   ```bash
   cd backend
   migrate -path ./internal/db/migrations \
     -database "postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" \
     version     # deve refletir a maior NNNNNN_ na pasta de migrations
   ```

   Use a string **direta** (porta 5432). Não o pooler.

4. **Storage — bucket `avatars`** (one-time, necessário pra upload de fotos de perfil):
   - Supabase Dashboard → Storage → **New bucket** → nome `avatars`, **Public** = ON.
   - Em SQL Editor, criar policies que limitam upload ao próprio usuário:
     ```sql
     create policy "avatars are publicly readable"
       on storage.objects for select to public
       using ( bucket_id = 'avatars' );

     create policy "users manage their own avatar"
       on storage.objects for all to authenticated
       using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text )
       with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
     ```
   - Convenção de path: `avatars/{user_id}/avatar-{timestamp}.{ext}`. O timestamp evita CDN cache stale após troca de imagem.

5. **Storage — bucket `group-photos`** (one-time, necessário pra foto do grupo e imagens de anúncio):
   - Supabase Dashboard → Storage → **New bucket** → nome `group-photos`, **Public** = ON.
   - Em SQL Editor, criar a função helper + policies (escrita restrita a admin/moderator do grupo). A migration `000021` recria a função como `SECURITY DEFINER` — com RLS ligado em `group_memberships`, a versão sem isso deixa de enxergar a tabela e o upload quebra:
     ```sql
     create or replace function public.is_group_admin_or_moderator(gid uuid)
     returns boolean
     language sql
     stable
     security definer
     set search_path = public
     as $$
       select exists (
         select 1 from public.group_memberships
         where group_id = gid
           and user_id = auth.uid()
           and role in ('ADMIN','MODERATOR')
           and deleted_at is null
       );
     $$;

     create policy "group-photos publicly readable"
       on storage.objects for select to public
       using ( bucket_id = 'group-photos' );

     create policy "group admins/moderators manage group photos"
       on storage.objects for all to authenticated
       using (
         bucket_id = 'group-photos'
         and public.is_group_admin_or_moderator(((storage.foldername(name))[1])::uuid)
       )
       with check (
         bucket_id = 'group-photos'
         and public.is_group_admin_or_moderator(((storage.foldername(name))[1])::uuid)
       );
     ```
   - Convenção de path:
     - capa do grupo: `group-photos/{group_id}/cover-{timestamp}.{ext}`
     - imagem de anúncio: `group-photos/{group_id}/announcements/{timestamp}-{rand}.{ext}`

### 1.1 E-mails de conta (Resend, grátis)

O SMTP embutido do Supabase manda ~2 e-mails por hora: confirmação de cadastro e reset de senha falham assim que houver gente de verdade. O plano grátis do Resend dá 100 e-mails/dia e 3 mil/mês, sem cartão.

1. Crie a conta em resend.com → **Domains → Add domain** → `creo.com.br`.
2. No DNS do domínio, adicione os registros que o Resend mostrar (SPF `TXT`, DKIM `TXT`/`CNAME` e o `MX` de retorno). Acrescente um DMARC simples: `TXT _dmarc` = `v=DMARC1; p=none;`. Espere o domínio ficar **Verified**.
3. **API Keys → Create** com permissão *Sending access*.
4. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email `nao-responda@creo.com.br`, sender name `Creo`
   - Host `smtp.resend.com`, port `465`, username `resend`, password = a API key
5. **Authentication → Rate Limits**: *emails sent per hour* = `30` (o padrão com SMTP próprio é baixo).
6. **Authentication → Email Templates**: cole o HTML de `supabase/templates/` em cada template — `confirm-signup.html` (Confirm signup), `magic-link.html` (Magic Link), `reset-password.html` (Reset Password), `change-email.html` (Change Email Address). O assunto de cada um está no comentário do topo do arquivo. Os links usam `token_hash`, que o front verifica em `/auth` e `/auth/reset` — funcionam em qualquer navegador, diferente do link PKCE padrão.

### 1.2 Política de conta

Em **Authentication → Sign In / Providers → Email**:

- **Confirm email** = ON. Contas antigas não são afetadas: o auto-confirm já gravou `email_confirmed_at` nelas.
- **Secure email change** = ON (a troca precisa ser confirmada no endereço antigo e no novo).
- **Minimum password length** = `8` (o mesmo `PASSWORD_MIN` de `frontend/src/lib/password.ts`).

### 1.3 Captcha (Cloudflare Turnstile, grátis e ilimitado)

1. dash.cloudflare.com → **Turnstile → Add widget**: hostnames `www.creo.com.br`, `creo.com.br`, `paroquiaviva.vercel.app` e `localhost`; modo *Managed*.
2. Copie a **site key** para `VITE_TURNSTILE_SITE_KEY` (Vercel, service frontend; e `frontend/.env` para dev).
3. **Faça o deploy do front com a site key antes do próximo passo.**
4. Supabase → **Authentication → Attack Protection → Enable Captcha protection** → provider *Turnstile* → cole a **secret key**.

> A ordem importa: com o captcha ligado no Supabase e um front sem a site key, todo login, cadastro, link mágico e reset é recusado. Para desligar numa emergência, basta desmarcar o captcha no Supabase.

### 1.4 Exclusão de conta

`DELETE /me` remove o usuário do Supabase Auth pela Admin API. Copie a **service_role key** (Project Settings → API) para `SUPABASE_SERVICE_ROLE_KEY` no service **backend** da Vercel. Nunca no frontend. Sem ela, a exclusão responde `503` e nada é apagado.

---

## 2. Vercel — deploy do monorepo

O repo já contém:
- `vercel.json` na raiz com `experimentalServices`.
- `frontend/vercel.json` (SPA rewrite + cache).
- `backend/Dockerfile` (não usado pela Vercel, mas serve para testes locais e backup).

### 2.1 Import do repo (primeira vez, via dashboard)

1. Vercel Dashboard → **Add New... → Project**.
2. Import do GitHub `danfigueroa/paroquiaviva`.
3. **Application Preset: Services** (a Vercel já detecta pelo `vercel.json` raiz).
4. Confirme que a tela mostra dois services:
   - `frontend` → `/` (Vite)
   - `backend` → `/_/backend` (Go)
5. Antes de clicar Deploy, abra **Environment Variables** e configure (passos 2.2 e 2.3 abaixo).

### 2.2 Env vars do **frontend**

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `/_/backend/api/v1` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (Supabase → API → anon public) |
| `VITE_TURNSTILE_SITE_KEY` | site key do Turnstile (seção 1.3) |

> Caminho relativo `/_/backend/api/v1` funciona porque frontend e backend são servidos pelo mesmo domínio. Se quiser deixar absoluto, troque para `https://www.creo.com.br/_/backend/api/v1`.

### 2.3 Env vars do **backend**

| Key | Value |
|---|---|
| `DATABASE_URL` | string do **pooler** do Supabase (porta **6543**, Transaction mode) |
| `JWT_ISSUER` | `https://<ref>.supabase.co/auth/v1` |
| `JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `CORS_ALLOWED_ORIGINS` | `https://www.creo.com.br` (defense-in-depth; mesma origem não exige, mas não atrapalha) |
| `JWKS_CACHE_TTL` | `10m` |
| `RATE_LIMIT_REQUESTS` | `120` |
| `RATE_LIMIT_WINDOW` | `1m` |
| `PRAYED_WINDOW_HOURS` | `12` |
| `PRAYED_IP_BURST_PER_HOUR` | `200` |
| `WRITE_RATE_LIMIT_REQUESTS` | `30` (escritas por usuário por janela) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (seção 1.4) — **segredo** |

> **Não** defina `HTTP_ADDR` — o backend já cai para `:$PORT` (Vercel injeta `PORT` automaticamente em Web Services).

> **Não** defina `VITE_*` no backend nem `DATABASE_URL` no frontend. Na tela de env var da Vercel, você consegue associar cada variável a um service específico (menu "Applies to" / "Services").

### 2.4 Deploy

Clicar **Deploy**. O log mostra dois builds em paralelo (frontend Vite + backend Go). Primeiro deploy demora ~3-5min.

Quando terminar, abrir a URL e fazer smoke:

```bash
# Health do backend (via proxy Vercel)
curl https://www.creo.com.br/_/backend/health

# Documentação da API (Swagger UI) — o "Try it out" já aponta pra /_/backend/api/v1
open https://www.creo.com.br/_/backend/docs

# Frontend
open https://www.creo.com.br
```

### 2.5 Re-deploys e CLI

Depois do primeiro deploy via dashboard, `git push` para `main` dispara deploy automático. Para usar CLI:

```bash
# na raiz do repo
vercel                 # preview
vercel --prod          # produção
vercel env ls          # listar env vars
vercel env add VITE_API_BASE_URL production
vercel logs            # logs em tempo real (incluem backend)
```

---

## 3. Smoke E2E

1. Abrir URL final → landing.
2. Landing, aba **Criar** → criar conta com e-mail e senha escolhendo tradição (a confirmação de e-mail está automática no Supabase, a conta já entra).
3. `/feed` → ver feed vazio do usuário novo. Criar pedido em `/requests/new`.
4. Em outra aba (user diferente): ver o pedido, orar por ele.
5. Em `/profile`: trocar tradição, confirmar que feed esvazia/se atualiza.
6. `vercel logs` em paralelo — sem 5xx.

---

## 4. Rollback

Dashboard Vercel → **Deployments** → escolher versão anterior → "Promote to Production". Backend e frontend rebobinam juntos.

---

## 5. Custos esperados (Hobby tier)

- **Vercel Hobby**: frontend grátis (100 GB bandwidth/mês). Web Services em `experimentalServices` usam o orçamento de Compute — confira o medidor em Usage. Para tráfego baixo-médio, deve ficar no free.
- **Supabase Free**: 500 MB DB, 1 GB storage, 50k MAU.

---

## 6. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `DATABASE_URL is required` no log do backend | Env var não setada, ou setada só no frontend | Verifique em Settings → Environment Variables que a var está associada ao service **backend** e ao ambiente **Production** |
| 404 no `/_/backend/*` | `vercel.json` raiz não detectado | Confirmar que está na raiz do repo (não em `frontend/`) e que o redeploy foi pós-commit |
| CORS error no console | `CORS_ALLOWED_ORIGINS` ≠ domínio real | Atualizar env var e redeploy |
| 502 intermitente no backend | Cold start ou falha ao abrir pool pgx | Checar `DATABASE_URL` (deve ser o **pooler** 6543, não direto 5432 que estoura conexões) |
| Auth redirect cai fora | Site/Redirect URL errada no Supabase | Ajustar em Auth → URL Configuration |
| Backend quebra com erro de porta | `HTTP_ADDR` setado manualmente | Remover a env var; o código cai em `$PORT` automaticamente |

Para logs do backend: `vercel logs --follow` e filtrar pela service `backend`.

---

## Plano B — Vercel só frontend, Fly.io no backend

Se a feature experimental da Vercel der problema, segregar é simples:

1. Apagar o `vercel.json` raiz (commit: `git rm vercel.json && git commit`).
2. No dashboard Vercel → Settings → Root Directory → mudar para `frontend/`.
3. `VITE_API_BASE_URL` passa a apontar para o domínio Fly: `https://parish-viva-api.fly.dev/api/v1`.
4. Deploy do backend na Fly:
   ```bash
   cd backend
   fly launch --no-deploy --copy-config --name parish-viva-api --region gru
   fly secrets set DATABASE_URL=... JWT_ISSUER=... JWKS_URL=... CORS_ALLOWED_ORIGINS="https://www.creo.com.br"
   fly deploy
   ```
5. Conferir que `CORS_ALLOWED_ORIGINS` inclui o domínio de produção (`https://www.creo.com.br`).

Os artefatos desse plano (`backend/Dockerfile`, `backend/fly.toml`) já estão no repo e continuam funcionando se precisar.

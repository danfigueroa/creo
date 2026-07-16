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

Pegue a URL Vercel final (ou um palpite, ex: `https://paroquiaviva.vercel.app`) e:

1. **Auth → URL Configuration**
   - `Site URL` = `https://paroquiaviva.vercel.app`
   - `Redirect URLs` = `https://paroquiaviva.vercel.app/auth` (e `http://localhost:5173/auth` para dev)
   - Sem isso, magic link e reset de senha falham.

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
   - Em SQL Editor, criar a função helper + policies (escrita restrita a admin/moderator do grupo):
     ```sql
     create or replace function public.is_group_admin_or_moderator(gid uuid)
     returns boolean
     language sql
     stable
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

> Caminho relativo `/_/backend/api/v1` funciona porque frontend e backend são servidos pelo mesmo domínio. Se quiser deixar absoluto, troque para `https://<vercel-domain>/_/backend/api/v1` depois do primeiro deploy.

### 2.3 Env vars do **backend**

| Key | Value |
|---|---|
| `DATABASE_URL` | string do **pooler** do Supabase (porta **6543**, Transaction mode) |
| `JWT_ISSUER` | `https://<ref>.supabase.co/auth/v1` |
| `JWKS_URL` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `CORS_ALLOWED_ORIGINS` | `https://<vercel-domain>` (defense-in-depth; mesma origem não exige, mas não atrapalha) |
| `JWKS_CACHE_TTL` | `10m` |
| `RATE_LIMIT_REQUESTS` | `120` |
| `RATE_LIMIT_WINDOW` | `1m` |
| `PRAYED_WINDOW_HOURS` | `12` |
| `PRAYED_IP_BURST_PER_HOUR` | `200` |

> **Não** defina `HTTP_ADDR` — o backend já cai para `:$PORT` (Vercel injeta `PORT` automaticamente em Web Services).

> **Não** defina `VITE_*` no backend nem `DATABASE_URL` no frontend. Na tela de env var da Vercel, você consegue associar cada variável a um service específico (menu "Applies to" / "Services").

### 2.4 Deploy

Clicar **Deploy**. O log mostra dois builds em paralelo (frontend Vite + backend Go). Primeiro deploy demora ~3-5min.

Quando terminar, abrir a URL e fazer smoke:

```bash
# Health do backend (via proxy Vercel)
curl https://<vercel-domain>/_/backend/health

# Frontend
open https://<vercel-domain>
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
2. `/auth` → criar conta nova escolhendo tradição. Confirmar e-mail.
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
   fly secrets set DATABASE_URL=... JWT_ISSUER=... JWKS_URL=... CORS_ALLOWED_ORIGINS="https://<vercel-domain>"
   fly deploy
   ```
5. Atualizar `CORS_ALLOWED_ORIGINS` com o domínio Vercel real.

Os artefatos desse plano (`backend/Dockerfile`, `backend/fly.toml`) já estão no repo e continuam funcionando se precisar.

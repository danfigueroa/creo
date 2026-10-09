# Setup de segurança — passo a passo pós-push

Configurações de painel que acompanham as medidas de segurança (confirmação de
e-mail, recuperação de senha, captcha, exclusão de conta). **A ordem importa**:
cada etapa só depende das anteriores, então se algo quebrar você sabe
exatamente o que desfazer. Tudo aqui é gratuito.

Os links do Supabase já apontam para o projeto (`hkybwprhrhajvnklpgiz`). A
migration de RLS (`000021`) já está aplicada em produção — não precisa rodar
nada no banco.

| Etapa | O quê | Quando |
|---|---|---|
| 0 | Chaves do Turnstile e do Supabase, variáveis na Vercel | antes do push |
| 1 | Push e conferência do deploy | — |
| 2 | E-mail pela Resend (SMTP) | depois do deploy |
| 3 | Templates de e-mail em pt-BR | **só depois da etapa 1** |
| 4 | Exigir confirmação de e-mail | depois da 3 |
| 5 | Ligar o captcha | **sempre por último** |
| 6 | Testes finais da conta | — |

---

## Etapa 0 — Chaves e variáveis (antes do push)

As variáveis `VITE_*` entram no build: criadas depois do push, só valem após um
redeploy.

### 0.1 Criar o widget do Turnstile (captcha grátis)

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com) (crie uma conta
   se não tiver — grátis, sem cartão; **não** precisa mudar o DNS para a
   Cloudflare).
2. No menu lateral, abra **Turnstile** (em algumas versões fica dentro de
   "Application security") → **Add widget**.
3. Preencha:
   - **Widget name:** `Creo`
   - **Hostname management:** adicione, um por vez:
     `www.creo.com.br`, `creo.com.br`, `paroquiaviva.vercel.app`, `localhost`
     (o `localhost` é para o dev funcionar; dev e produção usam o mesmo projeto
     Supabase, que só aceita um secret)
   - **Widget mode:** **Managed** (a maioria das pessoas não vê desafio nenhum,
     só um check rápido)
   - **Pre-clearance:** deixe desligado
4. **Create**. Copie as duas chaves:
   - **Site key** → pública, vai no frontend
   - **Secret key** → privada, vai só no Supabase (etapa 5)

Guia oficial: [Cloudflare — criar widget pelo dashboard](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)

### 0.2 Pegar a chave secreta do Supabase (para a exclusão de conta)

1. Abra [Supabase → Settings → API Keys](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/settings/api-keys).
2. Use a **secret key** (`sb_secret_...`, aba de chaves novas — recomendada) ou,
   na aba **Legacy API keys**, a **service_role** (começa com `eyJ...`). O
   código aceita as duas.
3. ⚠️ Essa chave ignora todas as regras de acesso do banco. Nunca coloque no
   frontend nem em commit.

Guia oficial: [Supabase — API keys](https://supabase.com/docs/guides/api/api-keys)

### 0.3 Cadastrar as variáveis na Vercel

1. [vercel.com](https://vercel.com) → projeto `paroquiaviva` → **Settings →
   Environment Variables**.
2. Crie (marque *Production*, *Preview* e *Development*):

   | Key | Value | Service |
   |---|---|---|
   | `VITE_TURNSTILE_SITE_KEY` | site key do 0.1 | **frontend** |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave do 0.2 | **backend** |

   Selecione o service certo em "Applies to" / "Services" — variável no service
   errado não chega onde precisa.
3. Opcional: `WRITE_RATE_LIMIT_REQUESTS` (padrão já é 30).

Guia oficial: [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)

> Pôr a site key no ar antes de ligar o captcha no Supabase é seguro: com o
> captcha desligado, o Supabase ignora o token.

---

## Etapa 1 — Push e conferência do deploy

1. Faça o push. Em **Vercel → Deployments**, espere os dois services
   (frontend e backend) ficarem **Ready**.
2. No terminal, confira os headers da API:
   ```bash
   curl -sI https://www.creo.com.br/_/backend/api/v1/feed/public | grep -i "content-security\|x-frame\|x-vercel-id"
   ```
   Esperado: `content-security-policy: default-src 'none'...`,
   `x-frame-options: DENY` e `x-vercel-id: gru1::pdx1::...` (região continua
   `pdx1`).
3. E os do site:
   ```bash
   curl -sI https://www.creo.com.br | grep -i "content-security\|strict-transport"
   ```
4. Abra https://www.creo.com.br no Chrome com o DevTools (`Cmd+Option+I`) na
   aba **Console** e navegue por: landing → login com senha → feed → detalhe de
   um pedido → perfil (troque a foto) → um grupo. **Não pode aparecer nenhuma
   mensagem com "Content Security Policy" ou "Refused to load".**
5. O widget do Turnstile já deve aparecer nos formulários de login e cadastro.
   Isso confirma que a site key entrou no build.

**Se der errado:**

- **Erro de CSP no console:** apague a linha `Content-Security-Policy` de
  `frontend/vercel.json` e faça push; depois ajuste a política para o recurso
  bloqueado.
- **Login não funciona:** pode ser o check novo de `aud`/`role` do token.
  Confira em Vercel → Logs. Rollback imediato: em Deployments, **Promote** no
  deploy anterior.
- **Capa do grupo que vinha do Freepik sumiu:** esperado (a CSP bloqueia imagem
  externa). Suba a foto de novo nas configurações do grupo.

---

## Etapa 2 — E-mail pela Resend (grátis: 100/dia, 3 mil/mês)

O SMTP embutido do Supabase manda só ~2 e-mails por hora; sem isto,
confirmação de cadastro e reset de senha falham com usuários reais.

### 2.1 Conta e domínio na Resend

1. Crie a conta em [resend.com](https://resend.com).
2. [Domains](https://resend.com/domains) → **Add Domain** → `creo.com.br`
   (região padrão, `us-east-1`, serve).
3. A Resend mostra uma tabela de registros DNS — normalmente um **MX** e um
   **TXT** (SPF) no subdomínio `send`, e um **TXT** (DKIM) em
   `resend._domainkey`. Deixe essa aba aberta.

### 2.2 Registros DNS na Hostinger

O DNS do `creo.com.br` está na Hostinger (nameservers `dns-parking.com`).

1. [hPanel da Hostinger](https://hpanel.hostinger.com) → **Domínios** →
   `creo.com.br` → **DNS / Nameservers** (ou "Zona DNS").
2. Para cada linha da Resend, **Adicionar registro** copiando **Tipo**, **Nome**
   e **Valor** exatamente como aparecem (para o MX, use a **prioridade**
   indicada, geralmente 10).
   - No campo Nome a Hostinger completa o domínio sozinha: escreva `send`, não
     `send.creo.com.br`.
3. Adicione também o DMARC (recomendado para entregabilidade):
   - **Tipo:** `TXT` · **Nome:** `_dmarc` · **Valor:** `v=DMARC1; p=none;`
4. Hoje não existe nenhum MX/TXT no `creo.com.br`, então não há conflito com
   e-mail existente.
5. Volte à Resend → **Verify DNS Records**. A propagação leva de minutos a
   algumas horas. Espere todos ficarem **Verified**. Para conferir:
   ```bash
   dig +short TXT resend._domainkey.creo.com.br
   ```

Guia oficial: [Resend — adicionar e verificar domínio](https://resend.com/docs/dashboard/domains/introduction)

### 2.3 Chave de API

1. [Resend → API Keys](https://resend.com/settings/api-keys) → **Create API Key**.
2. **Name:** `supabase-smtp` · **Permission:** *Sending access* · **Domain:**
   `creo.com.br`.
3. Copie a chave (`re_...`) — ela só aparece uma vez.

### 2.4 Ligar o SMTP no Supabase

1. [Supabase → Auth → SMTP](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/smtp) → **Enable Custom SMTP**.
2. Preencha:

   | Campo | Valor |
   |---|---|
   | Sender email | `nao-responda@creo.com.br` |
   | Sender name | `Creo` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a chave `re_...` |

3. **Save**.
4. [Auth → Rate Limits](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/rate-limits):
   com SMTP próprio o Supabase começa em 30 e-mails/hora. Deixe assim ou ajuste
   até o limite diário da Resend (100).

Guias oficiais: [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp) · [Supabase — SMTP próprio](https://supabase.com/docs/guides/auth/auth-smtp)

**Teste:** em https://www.creo.com.br/auth digite seu e-mail e clique em
**link mágico**. O e-mail tem que chegar (ainda no template padrão, em inglês)
e aparecer em [Resend → Emails](https://resend.com/emails).

---

## Etapa 3 — Templates de e-mail em pt-BR (só depois da etapa 1)

Os templates novos geram links com `token_hash`, que só o frontend novo
entende. Colados antes do deploy, os links quebrariam.

### 3.1 URLs permitidas

[Auth → URL Configuration](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/url-configuration):

- **Site URL:** `https://www.creo.com.br` (é a base dos links de todos os
  e-mails)
- **Redirect URLs** → **Add URL** para cada uma que faltar:
  - `https://www.creo.com.br/auth`
  - `https://www.creo.com.br/auth/reset`
  - `http://localhost:5173/**` (o `**` cobre qualquer caminho, para dev)

Guia oficial: [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### 3.2 Colar os templates

[Auth → Email Templates](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/templates).
Para cada template: troque o **Subject**, apague o corpo, cole o conteúdo
inteiro do arquivo e clique em **Save**. Para copiar um arquivo:
`pbcopy < supabase/templates/confirm-signup.html`.

| Template no painel | Arquivo | Subject |
|---|---|---|
| Confirm sign up | `supabase/templates/confirm-signup.html` | Confirme seu e-mail no Creo |
| Magic link or OTP | `supabase/templates/magic-link.html` | Seu link de acesso ao Creo |
| Reset password | `supabase/templates/reset-password.html` | Redefinir sua senha do Creo |
| Change email address | `supabase/templates/change-email.html` | Confirme a troca de e-mail no Creo |

- **Invite user** e **Reauthentication** não são usados pelo app — pode deixar.
- Há também uma seção opcional de "Security notifications" (ex.: "senha
  alterada"), em inglês; dá para ligar e traduzir depois.

Guia oficial: [Supabase — Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

**Testes:**

1. **Link mágico:** o e-mail chega em português, e o botão entra direto no
   `/feed`.
2. **Esqueci a senha** (`/auth` → "Esqueceu a senha?"): o link abre
   `/auth/reset`, você define a nova senha e cai no feed. Teste também abrindo
   o link **em outro navegador** ou no celular — antes não funcionava, agora
   tem que funcionar.
3. **`/auth/reset` sem link:** logado, digite
   `https://www.creo.com.br/auth/reset` direto na barra. Tem que aparecer
   **"link inválido"**.

---

## Etapa 4 — Exigir confirmação de e-mail

[Auth → Providers → Email](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/providers)
(em algumas versões: "Sign In / Providers" → **Email**):

- **Confirm email:** ON
- **Secure email change:** ON (a troca só vale depois de confirmar no endereço
  antigo e no novo)
- **Minimum password length:** `8` (o mesmo `PASSWORD_MIN` do app)
- **Save**

As contas existentes continuam entrando — já estão marcadas como confirmadas.

**Testes** (o Gmail aceita aliases: `seuemail+teste1@gmail.com` cai na sua
caixa):

1. Crie uma conta com um alias → aparece "Confira seu e-mail" → o link do
   e-mail confirma e loga.
2. Crie outra e tente entrar **sem** confirmar → mensagem de e-mail não
   confirmado com o botão **"Reenviar confirmação"** (espera 60 s entre
   envios).
3. Em **Perfil → Conta → E-mail**, troque o e-mail de uma conta de teste →
   chegam dois e-mails, e a troca só conclui depois de confirmar os dois.

---

## Etapa 5 — Ligar o captcha (sempre por último)

1. Confirme que o widget do Turnstile aparece no login e no cadastro do site
   (etapa 1, item 5). **Se não aparecer, pare aqui.**
2. [Auth → Attack Protection](https://supabase.com/dashboard/project/hkybwprhrhajvnklpgiz/auth/protection)
   → em "Bot and Abuse Protection", **Enable CAPTCHA protection**.
3. **Provider:** Turnstile · **Secret key:** a secret key do item 0.1.
4. **Save**.

Guia oficial: [Supabase — CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)

**Testes:** saia da conta e teste entrar com senha, criar conta, link mágico e
esqueci a senha. Tudo tem que funcionar normalmente.

**Se o login quebrar:** desligue o captcha na mesma tela — volta na hora.
Causas comuns:

- site key não entrou no build (confira a variável na Vercel e faça redeploy);
- hostname faltando no widget da Cloudflare;
- secret colado no Supabase é de outro widget.

---

## Etapa 6 — Testes finais da conta

Com uma conta de teste, em **Perfil → Conta**:

| O que testar | Esperado |
|---|---|
| Trocar senha | Pede a senha atual; os outros dispositivos são desconectados |
| Sair de todos os dispositivos | Pede confirmação e desconecta todos |
| Baixar meus dados | Baixa `creo-dados.json` com perfil, pedidos, amizades etc. |
| Excluir conta sendo admin único de grupo com membros | Aviso com a lista de grupos, nada é apagado |
| Excluir conta (caso normal) | Volta para a landing; login falha depois; o mesmo e-mail consegue criar conta nova |

Se a exclusão disser "indisponível no momento", a `SUPABASE_SERVICE_ROLE_KEY`
não chegou ao **backend** — confira o service da variável na Vercel e faça
redeploy. Nada é apagado nesse caso.

---

## Ambiente local (depois de tudo)

- `frontend/.env`: `VITE_TURNSTILE_SITE_KEY=<site key>` — depois da etapa 5, o
  login local também exige captcha.
- `backend/.env`: `SUPABASE_SERVICE_ROLE_KEY=<chave>`, só se for testar
  exclusão de conta localmente.
- Como o Site URL é o de produção, e-mails pedidos no dev (confirmação, reset)
  abrem em www.creo.com.br. O link funciona do mesmo jeito.

---

Referências: [Turnstile — testes](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) ·
[Resend — preços](https://resend.com/pricing) ·
[Supabase — SMTP](https://supabase.com/docs/guides/auth/auth-smtp) ·
[Supabase — CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha) ·
[Supabase — API keys](https://supabase.com/docs/guides/api/api-keys)

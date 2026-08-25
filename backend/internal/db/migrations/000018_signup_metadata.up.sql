-- O trigger on_auth_user_created (000003/000005) cria a linha em public.users no
-- instante do signUp, antes de qualquer requisição Go. Por isso UpsertAuthUser
-- sempre caía no ON CONFLICT DO UPDATE, cujo ramo nunca tocou em tradition — a
-- tradição escolhida no cadastro era descartada e o DEFAULT 'CATHOLIC'
-- prevalecia. O mesmo valia para o @username, sobrescrito pelo local-part do
-- e-mail que o trigger grava.
--
-- Esta flag deixa o backend aplicar a metadata do cadastro uma única vez, na
-- primeira requisição autenticada, sem risco de reverter escolhas posteriores.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS signup_metadata_applied BOOLEAN NOT NULL DEFAULT false;

-- Contas que já existem escolheram (ou já aceitaram) a tradição e o @username
-- atuais. Marcar como aplicada impede que a metadata antiga do JWT sobrescreva
-- qualquer coisa na primeira requisição depois do deploy.
UPDATE users SET signup_metadata_applied = true;

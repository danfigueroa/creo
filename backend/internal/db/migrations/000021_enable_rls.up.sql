-- O backend fala com o banco como `postgres` (dono das tabelas, BYPASSRLS),
-- então RLS sem policies não muda nada para ele. Quem perde acesso é o
-- PostgREST: a anon key vai no bundle do frontend e, sem isto, qualquer um lia
-- (e escrevia) direto nas tabelas, inclusive users.email.
--
-- Regra daqui pra frente: toda tabela nova em public precisa de
-- ENABLE ROW LEVEL SECURITY na própria migration.
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Usada pela policy de storage do bucket group-photos, que roda como
-- `authenticated`. Sem SECURITY DEFINER ela perderia a leitura de
-- group_memberships e o upload de foto de grupo quebraria. Foi criada pelo
-- painel; passa a viver aqui.
CREATE OR REPLACE FUNCTION public.is_group_admin_or_moderator(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.group_memberships
        WHERE group_id = gid
          AND user_id = auth.uid()
          AND role IN ('ADMIN', 'MODERATOR')
          AND deleted_at IS NULL
    );
$function$;

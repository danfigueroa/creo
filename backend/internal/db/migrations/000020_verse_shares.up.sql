-- Compartilhamento do versículo do dia no feed, com comentário do usuário.
--
-- Enum próprio de visibilidade em vez de reusar prayer_visibility: um
-- compartilhamento pode ser dirigido só aos amigos ('FRIENDS'), alcance que
-- pedidos de oração não têm — lá o feed home mostra os posts PUBLIC de amigos.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verse_share_visibility') THEN
        CREATE TYPE verse_share_visibility AS ENUM ('PUBLIC', 'FRIENDS', 'GROUP_ONLY', 'PRIVATE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS verse_shares (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id  UUID NOT NULL REFERENCES users(id),
    verse_id   UUID NOT NULL REFERENCES bible_verses(id),
    comment    TEXT NOT NULL DEFAULT '',
    visibility verse_share_visibility NOT NULL,
    tradition  tradition NOT NULL DEFAULT 'CATHOLIC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN verse_shares.tradition IS 'Snapshot da tradição do autor no momento do compartilhamento, espelhando prayer_requests.tradition — é por ele que os feeds filtram.';

CREATE TABLE IF NOT EXISTS verse_share_groups (
    verse_share_id UUID NOT NULL REFERENCES verse_shares(id) ON DELETE CASCADE,
    group_id       UUID NOT NULL REFERENCES groups(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (verse_share_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_verse_shares_public_feed
    ON verse_shares (tradition, created_at DESC)
    WHERE visibility = 'PUBLIC' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verse_shares_author
    ON verse_shares (author_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verse_shares_verse
    ON verse_shares (verse_id, author_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verse_share_groups_group
    ON verse_share_groups (group_id, verse_share_id);

-- prayer_actions vira polimórfica: a mesma reação (Ave Maria, Orei, ...) serve
-- pedidos e compartilhamentos de versículo, o que mantém ProfileStats contando
-- tudo num lugar só. É seguro para o SQL existente porque toda query atual
-- filtra prayer_request_id = $n ou = ANY($n::uuid[]), e linhas com NULL ali
-- nunca casam — nenhuma leitura precisou mudar.
ALTER TABLE prayer_actions ALTER COLUMN prayer_request_id DROP NOT NULL;
ALTER TABLE prayer_actions ADD COLUMN IF NOT EXISTS verse_share_id UUID REFERENCES verse_shares(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prayer_actions_one_subject'
    ) THEN
        ALTER TABLE prayer_actions ADD CONSTRAINT prayer_actions_one_subject CHECK (
            (prayer_request_id IS NOT NULL) <> (verse_share_id IS NOT NULL)
        );
    END IF;
END $$;

-- Espelha idx_prayer_actions_request_type (000016): cobre o GROUP BY do enrich.
CREATE INDEX IF NOT EXISTS idx_prayer_actions_verse_share_type
    ON prayer_actions (verse_share_id, action_type)
    WHERE verse_share_id IS NOT NULL;

-- Espelha idx_prayer_actions_user_request_created_at (000001): cobre o dedupe
-- por janela do RecordVerseShareAction.
CREATE INDEX IF NOT EXISTS idx_prayer_actions_user_verse_created_at
    ON prayer_actions (user_id, verse_share_id, created_at DESC)
    WHERE verse_share_id IS NOT NULL;

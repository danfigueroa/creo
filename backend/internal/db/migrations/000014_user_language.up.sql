DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'language') THEN
        CREATE TYPE language AS ENUM ('PT_BR', 'EN', 'ES');
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS language language;

UPDATE users SET language = 'PT_BR' WHERE language IS NULL;

ALTER TABLE users ALTER COLUMN language SET NOT NULL;
ALTER TABLE users ALTER COLUMN language SET DEFAULT 'PT_BR';

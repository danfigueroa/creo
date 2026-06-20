ALTER TABLE prayer_requests
    DROP COLUMN IF EXISTS answered_at,
    DROP COLUMN IF EXISTS testimony;

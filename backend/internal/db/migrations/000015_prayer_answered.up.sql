ALTER TABLE prayer_requests
    ADD COLUMN answered_at TIMESTAMPTZ,
    ADD COLUMN testimony   TEXT;

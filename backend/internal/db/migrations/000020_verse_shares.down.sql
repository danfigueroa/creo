DROP INDEX IF EXISTS idx_prayer_actions_user_verse_created_at;
DROP INDEX IF EXISTS idx_prayer_actions_verse_share_type;

ALTER TABLE prayer_actions DROP CONSTRAINT IF EXISTS prayer_actions_one_subject;
DELETE FROM prayer_actions WHERE prayer_request_id IS NULL;
ALTER TABLE prayer_actions DROP COLUMN IF EXISTS verse_share_id;
ALTER TABLE prayer_actions ALTER COLUMN prayer_request_id SET NOT NULL;

DROP INDEX IF EXISTS idx_verse_share_groups_group;
DROP INDEX IF EXISTS idx_verse_shares_verse;
DROP INDEX IF EXISTS idx_verse_shares_author;
DROP INDEX IF EXISTS idx_verse_shares_public_feed;

DROP TABLE IF EXISTS verse_share_groups;
DROP TABLE IF EXISTS verse_shares;

DROP TYPE IF EXISTS verse_share_visibility;

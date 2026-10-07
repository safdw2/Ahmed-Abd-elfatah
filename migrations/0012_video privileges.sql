-- =====================================================================
-- MIGRATION 0009 — Video Privileges (unlock codes)
-- Run ONCE against your EXISTING database (schema.sql already has all of
-- this for brand-new databases). Use the database_name from wrangler.toml:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0009_video_privileges.sql --remote
-- Running it twice fails on the ALTER TABLE line ("duplicate column"); that
-- is harmless, the CREATE TABLE statements below are safe to re-run.
-- =====================================================================

ALTER TABLE videos_table ADD COLUMN requires_code INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS video_access_codes_table (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT UNIQUE NOT NULL,
    student_id    TEXT NOT NULL,
    video_id      INTEGER NOT NULL,
    created_by    TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    redeemed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_vcodes_student ON video_access_codes_table (student_id, video_id);

CREATE TABLE IF NOT EXISTS video_unlocks_table (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    TEXT NOT NULL,
    video_id      INTEGER NOT NULL,
    unlocked_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, video_id)
);
-- =====================================================================
-- Migration 0010 — Video Access Codes (per-student, per-video unlock)
-- Run once against your D1 database before using "Video Privileges" in
-- the Admin Console:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0010_add_video_access_codes.sql --remote
-- (drop --remote to apply to your local dev DB instead)
-- =====================================================================

CREATE TABLE IF NOT EXISTS video_access_codes_table (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT UNIQUE NOT NULL,
    student_id      TEXT NOT NULL,
    video_id        INTEGER NOT NULL,
    redeemed        INTEGER DEFAULT 0,
    redeemed_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_codes_student ON video_access_codes_table (student_id);
CREATE INDEX IF NOT EXISTS idx_video_codes_video ON video_access_codes_table (video_id);
CREATE INDEX IF NOT EXISTS idx_video_codes_code ON video_access_codes_table (code);

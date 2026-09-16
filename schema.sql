-- =====================================================================
-- 🗄️ CLOUDFLARE D1 SCHEMA — "ahmed-abdelfatah-db"
-- Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
-- Bind this database to your Cloudflare Pages project as: DB
-- Apply with:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./schema.sql --remote
-- (drop --remote to apply to your local dev DB instead)
-- =====================================================================

-- --------------------------------------------------------------------
-- STUDENTS TABLE — one row per student/admin account
-- "phone" is the login ID the student types in on the login screen.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students_table (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    phone                   TEXT UNIQUE NOT NULL,
    name                    TEXT NOT NULL,
    password                TEXT NOT NULL DEFAULT '123456',
    grade                   TEXT DEFAULT 'Grade 10 (Secondary 1)',
    gender                  TEXT DEFAULT 'Boy',
    title                   TEXT,
    xp                      INTEGER DEFAULT 0,
    watch_mins              INTEGER DEFAULT 0,
    role                    TEXT DEFAULT 'student',
    can_post_feed           INTEGER DEFAULT 0,
    completed_lecture_ids   TEXT DEFAULT '[]',
    created_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_xp ON students_table (xp DESC, watch_mins DESC);

-- --------------------------------------------------------------------
-- VIDEOS TABLE — lecture registry (Archive.org MP4 or YouTube links)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS videos_table (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    lesson          TEXT DEFAULT '1',
    grade           INTEGER DEFAULT 10,
    filename        TEXT,
    archive_url     TEXT NOT NULL,
    duration_mins   INTEGER DEFAULT 45,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_videos_grade ON videos_table (grade);

-- --------------------------------------------------------------------
-- MATERIALS TABLE — worksheets / PDFs / study sheets
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials_table (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    type        TEXT DEFAULT 'Worksheet',
    grade       INTEGER DEFAULT 10,
    desc        TEXT DEFAULT '',
    filename    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_grade ON materials_table (grade);

-- --------------------------------------------------------------------
-- FEED TABLE — community announcements / posts
-- comments_json and likes_json store serialized JS arrays as text.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feed_table (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    author              TEXT NOT NULL,
    date                TEXT DEFAULT 'Today',
    text                TEXT NOT NULL,
    attachment_name     TEXT,
    image               TEXT,
    comments_json       TEXT DEFAULT '[]',
    likes_json          TEXT DEFAULT '[]',
    xp                  INTEGER DEFAULT 0,
    level_title         TEXT DEFAULT 'Novice Scientist 🟢',
    author_role         TEXT DEFAULT 'Student',
    author_gender       TEXT DEFAULT 'Boy',
    author_title        TEXT,
    font_size           TEXT DEFAULT '13px',
    text_color          TEXT,
    attachment_type     TEXT,
    attachment_url      TEXT,
    created_at          TEXT DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------------
-- PORTAL FEEDBACKS TABLE — star ratings & written suggestions
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_feedbacks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    author      TEXT NOT NULL,
    gender      TEXT DEFAULT 'Boy',
    id_val      TEXT DEFAULT 'guest',
    rating      INTEGER DEFAULT 0,
    text        TEXT NOT NULL,
    date        TEXT DEFAULT 'Today',
    created_at  TEXT DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------------
-- Seed the initial admin account. The explicit 'admin' role is the only role
-- allowed to open or operate the Admin Console.
-- Safe to run multiple times thanks to the UNIQUE(phone) guard.
-- --------------------------------------------------------------------
INSERT INTO students_table (phone, name, password, grade, gender, title, xp, watch_mins, role, can_post_feed)
VALUES ('admin', 'Administrator', 'admin123', 'Staff', 'Boy', 'Director', 0, 0, 'admin', 1)
ON CONFLICT(phone) DO NOTHING;

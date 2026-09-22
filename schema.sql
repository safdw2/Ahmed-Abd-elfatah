-- =====================================================================
-- 🗄️ CLOUDFLARE D1 SCHEMA — "ahmedabdelfatah-db"
-- Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
-- Bind this database to your Cloudflare Pages project as: DB
-- Apply with:
--   wrangler d1 execute ahmedabdelfatah-db --file=./schema.sql --remote
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
    -- Account tab profile picture: a preset filename (e.g. "student1.png")
    -- or a self-contained data: URI (emoji avatar or resized upload).
    -- Empty/NULL falls back to the old gender-based default avatar.
    avatar                  TEXT DEFAULT '',
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
    part            INTEGER DEFAULT 1,
    grade           TEXT DEFAULT 'Grade 10 (Secondary 1)',
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
    grade       TEXT DEFAULT 'Grade 10 (Secondary 1)',
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
-- TUTORING CENTER (ROOTS) TABLE — dashboard schedule board.
-- A "recurring" row is never cloned week to week: the app computes the
-- next matching weekday itself, so this row is the only copy until the
-- recurring flag is turned off or the row is deleted.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tutoring_table (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    session_date    TEXT NOT NULL,
    session_time    TEXT NOT NULL,
    location        TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    grade           TEXT DEFAULT 'All Grades',
    recurring       INTEGER DEFAULT 0,
    active          INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tutoring_date ON tutoring_table (session_date);
CREATE INDEX IF NOT EXISTS idx_tutoring_grade ON tutoring_table (grade);

-- --------------------------------------------------------------------
-- CHAT MESSAGES TABLE — every grade group chat and every direct message
-- thread share this one table, distinguished by room_id:
--   "grade:<Grade Name>"   e.g. "grade:Grade 10 (Secondary 1)"
--   "dm:<idA>|<idB>"       IDs sorted alphabetically, one thread per pair
-- --------------------------------------------------------------------
-- attachment_* columns hold a photo, PDF or voice note as a data: URI
-- (already resized/capped client-side before it ever reaches this table).
-- encrypted=1 means `text` (and attachment_url, if present) are AES-GCM
-- ciphertext produced client-side for that room; the server just stores
-- and returns bytes, it never sees plaintext for those rows.
CREATE TABLE IF NOT EXISTS chat_messages_table (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id             TEXT NOT NULL,
    sender_id           TEXT NOT NULL,
    sender_name         TEXT NOT NULL,
    sender_avatar       TEXT DEFAULT '',
    text                TEXT NOT NULL,
    attachment_type     TEXT,
    attachment_url      TEXT,
    attachment_name     TEXT,
    encrypted           INTEGER DEFAULT 0,
    -- Set to 1 the first time a message's text is edited (voice messages
    -- can never be edited, only deleted). Lets the chat bubble show a
    -- small "edited" tag next to the timestamp.
    edited              INTEGER DEFAULT 0,
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages_table (room_id, id);

-- --------------------------------------------------------------------
-- CHAT GRANTS TABLE — issued from the Admin Console. A row here is what
-- lets two specific accounts see and use a "dm:<idA>|<idB>" room together.
-- user_a/user_b are always stored sorted so a duplicate grant (either
-- order) is caught by the UNIQUE constraint.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_grants_table (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a      TEXT NOT NULL,
    user_b      TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_a, user_b)
);

-- --------------------------------------------------------------------
-- CHAT NICKNAMES TABLE — Direct Messaging is open to every account (any
-- student can message any other student, no admin pairing needed), so
-- chat_grants_table above is kept only for backward compatibility and is
-- no longer required to open a DM. This table instead lets each person
-- set a private custom label for a chat room (a DM or a grade group) —
-- it never changes anyone's real name, only what that one viewer sees.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_nicknames_table (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    room_id     TEXT NOT NULL,
    nickname    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, room_id)
);

-- --------------------------------------------------------------------
-- Seed the teacher/admin account so 'admin' / 'admin123' style logins
-- (handled in-app) always have a matching server-side record too.
-- Safe to run multiple times thanks to the UNIQUE(phone) guard.
-- --------------------------------------------------------------------
INSERT INTO students_table (phone, name, password, grade, gender, title, xp, watch_mins, role, can_post_feed)
VALUES ('admin', 'Administrator', 'admin123', 'Staff', 'Boy', 'Director', 0, 0, 'teacher', 1)
ON CONFLICT(phone) DO NOTHING;

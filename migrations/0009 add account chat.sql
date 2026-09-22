-- =====================================================================
-- 0009_add_account_chat.sql
-- Adds: per-student avatar column + the Chat tab's two tables
--   (chat_messages_table, chat_grants_table)
-- Project: MR. Ahmed Abd-ElFatah - Unified Student Workspace Portal
--
-- ⚠️ ONE-TIME SETUP — run this once against your D1 database before the
-- new Account/Chat tabs will work:
--   wrangler d1 execute ahmedabdelfatah-db --file=./0009_add_account_chat.sql --remote
-- (drop --remote to apply to your local dev DB instead)
--
-- Until this runs, /api/db/students/avatar and every /api/db/chat/* route
-- will just error out — the frontend already falls back to the old
-- gender-based avatar and hides chat history gracefully, but nothing new
-- will actually save.
-- =====================================================================

-- Per-student profile picture. Holds either a preset filename
-- (e.g. "student1.png") or a self-contained data: URI (an emoji avatar
-- built client-side, or a resized photo the student uploaded). Empty
-- string/NULL means "use the old gender-based default avatar".
ALTER TABLE students_table ADD COLUMN avatar TEXT DEFAULT '';

-- --------------------------------------------------------------------
-- CHAT MESSAGES TABLE — every grade group chat and every direct
-- message thread share this one table, distinguished by room_id:
--   "grade:<Grade Name>"   e.g. "grade:Grade 10 (Secondary 1)"
--   "dm:<idA>|<idB>"       IDs sorted alphabetically, one thread per pair
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages_table (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id         TEXT NOT NULL,
    sender_id       TEXT NOT NULL,
    sender_name     TEXT NOT NULL,
    sender_avatar   TEXT DEFAULT '',
    text            TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
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

-- =====================================================================
-- 0010_chat_upgrade.sql — run this ONCE against an already-deployed
-- database to add: chat attachments (photos/PDFs/voice notes), open
-- any-student-to-any-student DMs, and per-viewer chat nicknames.
--
-- A brand-new database doesn't need this file — schema.sql already
-- includes everything below. This file is only for an existing D1
-- database that was created before this update.
--
-- Apply with:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0010_chat_upgrade.sql --remote
-- (drop --remote to apply to your local dev DB instead)
-- =====================================================================

ALTER TABLE chat_messages_table ADD COLUMN attachment_type TEXT;
ALTER TABLE chat_messages_table ADD COLUMN attachment_url TEXT;
ALTER TABLE chat_messages_table ADD COLUMN attachment_name TEXT;
ALTER TABLE chat_messages_table ADD COLUMN encrypted INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS chat_nicknames_table (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    room_id     TEXT NOT NULL,
    nickname    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, room_id)
);

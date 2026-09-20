-- =====================================================================
-- Run this ONCE on an existing database to add the Tutoring Center
-- (Roots) dashboard feature. New databases get this directly from
-- schema.sql instead.
--
-- A "recurring" row is never cloned into new rows week after week —
-- the app works out the next matching weekday from session_date
-- itself — so this table only ever needs the one row per session,
-- until an admin turns recurring off or deletes it.
--
-- grade holds either 'All Grades' or one of the 4 canonical grade
-- strings used everywhere else in this app (see 0006's header):
--   'Grade 7 (Preparatory 1)' / 'Grade 8 (Preparatory 2)' /
--   'Grade 9 (Preparatory 3)' / 'Grade 10 (Secondary 1)'
--
-- Safe to run multiple times.
-- Apply with:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0008_add_tutoring_table.sql --remote
-- =====================================================================

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

-- Sanity check after running: should return an empty result (the table
-- starts with no rows) rather than an error.
-- SELECT * FROM tutoring_table;

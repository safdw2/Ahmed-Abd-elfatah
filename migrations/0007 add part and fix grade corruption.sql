-- =====================================================================
-- Run this ONCE on an existing database. New databases get this
-- directly from schema.sql.
--
-- Two things, both caused by the same underlying bug in the OLD
-- functions/[[path]].js (fixed separately, alongside this migration):
--
-- 1. videos_table had no "part" column at all. The admin "Register
--    Session" form has always had a Part Number field, but since the
--    column didn't exist, whatever you typed there was silently
--    thrown away by the INSERT and never made it into D1 — it would
--    look saved in the browser until the next refresh, then vanish.
--
-- 2. Both videos_table.grade and materials_table.grade were declared
--    INTEGER, and the OLD router did `parseInt(lec.grade) || 10` /
--    `parseInt(mat.grade) || 10` before saving. The app has only ever
--    sent the full canonical grade string ("Grade 9 (Preparatory 3)"),
--    and parseInt() on a string that starts with a letter returns
--    NaN — so THAT ALWAYS FELL BACK TO 10. Every single video/material
--    ever added, for any grade other than Grade 10, was silently saved
--    as Grade 10 in the database, regardless of what was actually
--    picked in the dropdown. The 0006 migration already normalized
--    the FORMAT of whatever was in these two columns at the time it
--    ran, but anything added AFTER 0006 (right up until this fix)
--    went right back to a raw, wrong "10".
--
-- ⚠️ IMPORTANT — what this migration can and can't fix:
-- It adds the part column (new rows keep whatever you type from now
-- on) and it re-normalizes any plain-integer grade value into the
-- matching canonical string. What it CANNOT do is recover which
-- grade a corrupted row was ORIGINALLY meant to be — that information
-- was already overwritten with "10" before this fix existed, and
-- nothing in the database records what was actually selected. After
-- running this, open the admin console and check every session/
-- material currently listed under Grade 10 — any that were really
-- meant for Prep 1/2/3 will need to be deleted and re-added now that
-- the save path is fixed.
--
-- Safe to run multiple times.
-- Apply with:
--   wrangler d1 execute ahmedabdelfatah-db --file=./0007_add_part_and_fix_grade_corruption.sql --remote
-- =====================================================================

ALTER TABLE videos_table ADD COLUMN part INTEGER DEFAULT 1;

UPDATE videos_table SET grade = CASE TRIM(grade)
    WHEN '7'  THEN 'Grade 7 (Preparatory 1)'
    WHEN '8'  THEN 'Grade 8 (Preparatory 2)'
    WHEN '9'  THEN 'Grade 9 (Preparatory 3)'
    WHEN '10' THEN 'Grade 10 (Secondary 1)'
    ELSE TRIM(grade)
END
WHERE grade IS NOT NULL;

UPDATE materials_table SET grade = CASE TRIM(grade)
    WHEN '7'  THEN 'Grade 7 (Preparatory 1)'
    WHEN '8'  THEN 'Grade 8 (Preparatory 2)'
    WHEN '9'  THEN 'Grade 9 (Preparatory 3)'
    WHEN '10' THEN 'Grade 10 (Secondary 1)'
    ELSE TRIM(grade)
END
WHERE grade IS NOT NULL;

-- Sanity check after running: every video/material currently shown as
-- Grade 10 here should be reviewed — some are probably mis-tagged
-- Prep 1/2/3 content that the old bug forced onto Grade 10.
-- SELECT id, title, grade FROM videos_table WHERE grade = 'Grade 10 (Secondary 1)';
-- SELECT id, title, grade FROM materials_table WHERE grade = 'Grade 10 (Secondary 1)';
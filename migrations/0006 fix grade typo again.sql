-- =====================================================================
-- Fix: normalize grade values to the 4 canonical strings, for EVERY
-- grade (7, 8, 9, 10) and every table that stores a grade string.
--
-- Why this is broader than 0005: 0005 only patched Grade 10's
-- "Secandory" -> "Secondary" typo. But the same exact-match filter in
-- renderVideos() / renderMaterials() breaks just as silently for ANY
-- grade if the stored value doesn't byte-for-byte match the dropdown's
-- canonical string — e.g. a legacy row saved as a bare number ("9"),
-- "Grade 9" with no parenthetical, a "Preperatory" misspelling, or
-- stray whitespace. This migration sweeps all of those, for all 4
-- grades, in students_table / videos_table / materials_table.
--
-- Canonical values (must match the dropdowns in index.html exactly):
--   'Grade 7 (Preparatory 1)'
--   'Grade 8 (Preparatory 2)'
--   'Grade 9 (Preparatory 3)'
--   'Grade 10 (Secondary 1)'
--
-- Safe to run multiple times.
-- Apply with:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0006_fix_grade_typo_again.sql --remote
-- =====================================================================

UPDATE students_table SET grade = CASE TRIM(grade)
    WHEN '7'                             THEN 'Grade 7 (Preparatory 1)'
    WHEN '8'                             THEN 'Grade 8 (Preparatory 2)'
    WHEN '9'                             THEN 'Grade 9 (Preparatory 3)'
    WHEN '10'                            THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7'                       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8'                       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9'                       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10'                      THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7 (Preperatory 1)'       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8 (Preperatory 2)'       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9 (Preperatory 3)'       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10 (Secandory 1)'        THEN 'Grade 10 (Secondary 1)'
    ELSE TRIM(grade)
END
WHERE grade IS NOT NULL;

UPDATE videos_table SET grade = CASE TRIM(grade)
    WHEN '7'                             THEN 'Grade 7 (Preparatory 1)'
    WHEN '8'                             THEN 'Grade 8 (Preparatory 2)'
    WHEN '9'                             THEN 'Grade 9 (Preparatory 3)'
    WHEN '10'                            THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7'                       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8'                       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9'                       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10'                      THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7 (Preperatory 1)'       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8 (Preperatory 2)'       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9 (Preperatory 3)'       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10 (Secandory 1)'        THEN 'Grade 10 (Secondary 1)'
    ELSE TRIM(grade)
END
WHERE grade IS NOT NULL;

UPDATE materials_table SET grade = CASE TRIM(grade)
    WHEN '7'                             THEN 'Grade 7 (Preparatory 1)'
    WHEN '8'                             THEN 'Grade 8 (Preparatory 2)'
    WHEN '9'                             THEN 'Grade 9 (Preparatory 3)'
    WHEN '10'                            THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7'                       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8'                       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9'                       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10'                      THEN 'Grade 10 (Secondary 1)'
    WHEN 'Grade 7 (Preperatory 1)'       THEN 'Grade 7 (Preparatory 1)'
    WHEN 'Grade 8 (Preperatory 2)'       THEN 'Grade 8 (Preparatory 2)'
    WHEN 'Grade 9 (Preperatory 3)'       THEN 'Grade 9 (Preparatory 3)'
    WHEN 'Grade 10 (Secandory 1)'        THEN 'Grade 10 (Secondary 1)'
    ELSE TRIM(grade)
END
WHERE grade IS NOT NULL;

-- Sanity check: this should list ONLY the 4 canonical strings above.
-- If anything else shows up, that's a format this migration didn't
-- anticipate and the WHERE clause list above needs another entry.
-- SELECT DISTINCT grade FROM students_table
-- UNION SELECT DISTINCT grade FROM videos_table
-- UNION SELECT DISTINCT grade FROM materials_table;

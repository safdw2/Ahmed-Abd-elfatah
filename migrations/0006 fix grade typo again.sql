-- =====================================================================
-- Fix: same "grade string mismatch" bug as 0005, applied defensively
-- across EVERY grade (not just Grade 10) and every table that stores a
-- grade string. Two ways this can silently break the exact-match grade
-- filter in renderVideos() / renderMaterials():
--
--   1. "Secandory" vs "Secondary" — the front-end dropdowns had reverted
--      back to the typo after 0005 ran, so any student/video/material
--      added in between is mismatched again. (The dropdowns themselves
--      are now fixed in index.html too — this just repairs the data.)
--   2. Stray leading/trailing whitespace on ANY grade value (e.g.
--      "Grade 9 (Preparatory 3) " with a trailing space) fails the
--      exact-match filter exactly like a spelling typo would.
--
-- Safe to run multiple times.
-- Apply with:
--   wrangler d1 execute ahmed-abdelfatah-db --file=./0006_fix_grade_typo_again.sql --remote
-- =====================================================================

-- 1. Re-apply the Grade 10 typo fix, in case any accounts/videos were
--    added between 0005 running and the front-end dropdown being fixed.
UPDATE students_table  SET grade = 'Grade 10 (Secondary 1)' WHERE grade = 'Grade 10 (Secandory 1)';
UPDATE videos_table    SET grade = 'Grade 10 (Secondary 1)' WHERE grade = 'Grade 10 (Secandory 1)';
UPDATE materials_table SET grade = 'Grade 10 (Secondary 1)' WHERE grade = 'Grade 10 (Secandory 1)';

-- 2. Trim stray whitespace off every grade value, for EVERY grade
--    (7, 8, 9, and 10 alike), in every table.
UPDATE students_table  SET grade = TRIM(grade) WHERE grade IS NOT NULL AND grade != TRIM(grade);
UPDATE videos_table    SET grade = TRIM(grade) WHERE grade IS NOT NULL AND grade != TRIM(grade);
UPDATE materials_table SET grade = TRIM(grade) WHERE grade IS NOT NULL AND grade != TRIM(grade);

-- Confirm no mismatched/whitespace-polluted rows remain (should return
-- 0 rows each):
-- SELECT id, phone, grade FROM students_table  WHERE grade LIKE '%Secandory%' OR grade != TRIM(grade);
-- SELECT id, title, grade FROM videos_table    WHERE grade LIKE '%Secandory%' OR grade != TRIM(grade);
-- SELECT id, title, grade FROM materials_table WHERE grade LIKE '%Secandory%' OR grade != TRIM(grade);

-- Optional: list every DISTINCT grade value currently in use across all
-- three tables, so you can eyeball anything that still doesn't match one
-- of the 4 canonical values —
--   'Grade 7 (Preparatory 1)', 'Grade 8 (Preparatory 2)',
--   'Grade 9 (Preparatory 3)', 'Grade 10 (Secondary 1)':
-- SELECT DISTINCT grade FROM students_table
-- UNION SELECT DISTINCT grade FROM videos_table
-- UNION SELECT DISTINCT grade FROM materials_table;
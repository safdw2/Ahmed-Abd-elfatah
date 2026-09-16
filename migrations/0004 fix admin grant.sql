-- =====================================================================
-- Fix: promote the portal owner account to admin regardless of its
-- current role (0003 only handled the old 'teacher' -> 'admin' case).
-- Safe to run multiple times.
--
-- Adjust the WHERE clause below to match YOUR admin login ID if it's
-- not literally 'admin'.
-- =====================================================================

-- 1. See what's actually in the row right now (run this first to confirm):
-- SELECT id, phone, name, role FROM students_table WHERE phone = 'admin';

-- 2. Force the grant, whatever the current role is:
UPDATE students_table
SET role = 'admin'
WHERE phone = 'admin';

-- 3. Confirm it stuck:
-- SELECT id, phone, name, role FROM students_table WHERE phone = 'admin';
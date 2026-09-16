-- Move the built-in portal owner from the legacy teacher role to the explicit
-- admin grant required by the Admin Console.
UPDATE students_table
SET role = 'admin'
WHERE phone = 'admin' AND role = 'teacher';

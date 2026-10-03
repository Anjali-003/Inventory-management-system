-- Run once on an existing database.
-- Check In now creates the row before a final status exists (status is set to PRESENT on Check Out),
-- so status must allow NULL. The CHECK constraint still applies to any non-NULL value.
ALTER TABLE attendance MODIFY COLUMN status VARCHAR(20) NULL;

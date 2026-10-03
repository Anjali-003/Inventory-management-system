-- Run this once if you already created the attendance table earlier.
-- Adds the column that records the exact moment a status button was pressed.
ALTER TABLE attendance ADD COLUMN marked_at DATETIME NULL AFTER check_out;

-- =====================================================================
-- 06_insert_employees.sql
-- Loads the employees again after 01_reset_data.sql (copied from the database on 2026-10-24).
--
-- * The original ids are kept on purpose: a new employee's code is EMP-<MAX(id) + 1>
--   (employee.service.js), so renumbering would hand out a code that already exists.
-- * Attendance is NOT loaded: after a reset it is collected again from today.
-- * SAFE TO RE-RUN: employees that already exist (same id / code / email) are skipped.
--
-- RUN ORDER: after 01_reset_data.sql (npm run seed runs it with the other files):
--   mysql --default-character-set=utf8mb4 -u <user> -p inventory_management < 06_insert_employees.sql
-- =====================================================================

USE inventory_management;

INSERT IGNORE INTO employees
    (id, employee_code, name, email, phone, department, designation, joined_on, is_active,
     date_of_birth, gender, address, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone)
VALUES
(1, 'EMP-0001', 'Aarav Sharma', 'aarav@example.com', NULL, 'Assembly', 'Line Supervisor', '2024-03-01', 0, NULL, NULL, NULL, NULL, NULL, NULL),
(2, 'EMP-0002', 'Priya Verma', 'priya@example.com', NULL, 'Quality', 'QC Inspector', '2024-06-15', 1, NULL, NULL, NULL, NULL, NULL, NULL),
(3, 'EMP-0003', 'Rohan Gupta', 'rohan@example.com', NULL, 'Stores', 'Store Keeper', '2023-11-20', 1, NULL, NULL, NULL, NULL, NULL, NULL),
(4, 'EMP-0004', 'Sneha Iyer', 'sneha@example.com', NULL, 'Assembly', 'Technician', '2025-01-10', 1, NULL, NULL, NULL, NULL, NULL, NULL),
(6, 'EMP-0006', 'Mahendra Pratap', 'mpratap1711@gmail.com', '9508608794', 'CSE', 'Software Dev', '2026-08-25', 1, NULL, NULL, NULL, NULL, NULL, NULL),
(7, 'EMP-0007', 'Prince', 'prince@gmail.com', '09508608794', 'Maintenance', 'Electrician', '2026-09-29', 1, NULL, NULL, NULL, NULL, NULL, NULL),
(8, 'EMP-0008', 'Rohan Aggarwal', 'rohan@sensation.com', '1234567890', 'Quality', 'Supervisor', '2026-10-05', 1, NULL, NULL, NULL, NULL, NULL, NULL);

-- Check (expect: 7 employees, 6 active, 0 attendance rows right after a reset)
SELECT (SELECT COUNT(*) FROM employees)                  AS employees,
       (SELECT COUNT(*) FROM employees WHERE is_active = 1) AS active,
       (SELECT COUNT(*) FROM attendance)                 AS attendance_rows;

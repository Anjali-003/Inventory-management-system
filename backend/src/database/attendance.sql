USE inventory_management;

-- =========================================
-- 10. EMPLOYEES
-- =========================================
CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(30),
    department VARCHAR(80),
    designation VARCHAR(80),
    joined_on DATE NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

-- =========================================
-- 11. ATTENDANCE (one row per employee per day)
-- =========================================
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NULL,  -- NULL while checked in but not yet checked out
    check_in TIME NULL,
    check_out TIME NULL,
    marked_at DATETIME NULL,
    notes VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT unique_employee_day
        UNIQUE (employee_id, attendance_date),
    CONSTRAINT chk_attendance_status
        CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE'))
);

CREATE INDEX idx_attendance_date ON attendance (attendance_date);

-- Optional sample data
INSERT IGNORE INTO employees (employee_code, name, email, department, designation, joined_on) VALUES
('EMP-0001', 'Aarav Sharma', 'aarav@example.com', 'Assembly', 'Line Supervisor', '2024-03-01'),
('EMP-0002', 'Priya Verma', 'priya@example.com', 'Quality', 'QC Inspector', '2024-06-15'),
('EMP-0003', 'Rohan Gupta', 'rohan@example.com', 'Stores', 'Store Keeper', '2023-11-20'),
('EMP-0004', 'Sneha Iyer', 'sneha@example.com', 'Assembly', 'Technician', '2025-01-10'),
('EMP-0005', 'Imran Khan', 'imran@example.com', 'Maintenance', 'Electrician', '2022-08-05');

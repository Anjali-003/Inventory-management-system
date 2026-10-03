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



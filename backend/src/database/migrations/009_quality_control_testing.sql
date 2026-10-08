CREATE TABLE IF NOT EXISTS testing_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,

    quantity_tested INT NOT NULL,
    quantity_passed INT NOT NULL DEFAULT 0,
    quantity_failed INT NOT NULL DEFAULT 0,

    overall_result VARCHAR(10) NOT NULL,
    remarks TEXT NULL,

    tested_by INT NOT NULL,
    tested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_testing_production
        FOREIGN KEY (production_id)
        REFERENCES production_orders(id),

    CONSTRAINT fk_testing_user
        FOREIGN KEY (tested_by)
        REFERENCES users(id),

    INDEX idx_testing_production (production_id)
);


CREATE TABLE IF NOT EXISTS quality_control_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,

    quantity_inspected INT NOT NULL,
    quantity_approved INT NOT NULL DEFAULT 0,
    quantity_rejected INT NOT NULL DEFAULT 0,

    overall_result VARCHAR(10) NOT NULL,
    remarks TEXT NULL,

    checked_by INT NOT NULL,
    checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_qc_production
        FOREIGN KEY (production_id)
        REFERENCES production_orders(id),

    CONSTRAINT fk_qc_user
        FOREIGN KEY (checked_by)
        REFERENCES users(id),

    INDEX idx_qc_production (production_id)
);
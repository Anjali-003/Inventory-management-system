CREATE TABLE IF NOT EXISTS quality_control_batch_decisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,
    decision VARCHAR(10) NOT NULL,
    decided_by INT NULL,
    decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_qc_batch_decision_production UNIQUE (production_id),
    CONSTRAINT fk_qc_batch_decision_production
        FOREIGN KEY (production_id) REFERENCES production_orders(id),
    CONSTRAINT fk_qc_batch_decision_user
        FOREIGN KEY (decided_by) REFERENCES users(id),
    INDEX idx_qc_batch_decision_decision_at (decision, decided_at)
);

-- Allow a production batch to have multiple QC attempts while preserving every decision.
ALTER TABLE quality_control_batch_decisions
    DROP INDEX uq_qc_batch_decision_production,
    ADD COLUMN attempt_number INT NOT NULL DEFAULT 1 AFTER production_id,
    ADD COLUMN remarks TEXT NULL AFTER decision,
    ADD CONSTRAINT uq_qc_batch_decision_attempt UNIQUE (production_id, attempt_number),
    ADD INDEX idx_qc_batch_decision_production_attempt (production_id, attempt_number);

-- Track what Production must do after a QC failure and when it is submitted for retest.
CREATE TABLE IF NOT EXISTS quality_control_rework_cycles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    production_id INT NOT NULL,
    failed_attempt_number INT NOT NULL,
    failure_decision_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NEEDS_REWORK',
    started_by INT NULL,
    started_at DATETIME NULL,
    submitted_by INT NULL,
    submitted_at DATETIME NULL,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    rework_remarks TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_qc_rework_production_attempt UNIQUE (production_id, failed_attempt_number),
    CONSTRAINT fk_qc_rework_production FOREIGN KEY (production_id) REFERENCES production_orders(id),
    CONSTRAINT fk_qc_rework_failure_decision FOREIGN KEY (failure_decision_id) REFERENCES quality_control_batch_decisions(id),
    CONSTRAINT fk_qc_rework_started_by FOREIGN KEY (started_by) REFERENCES users(id),
    CONSTRAINT fk_qc_rework_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id),
    CONSTRAINT fk_qc_rework_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id),
    INDEX idx_qc_rework_status (status, updated_at),
    INDEX idx_qc_rework_production_status (production_id, status)
);

-- Existing failed decisions become rework tasks so they are not stranded by the new workflow.
INSERT IGNORE INTO quality_control_rework_cycles
    (production_id, failed_attempt_number, failure_decision_id, status, created_at)
SELECT production_id, attempt_number, id, 'NEEDS_REWORK', decided_at
FROM quality_control_batch_decisions
WHERE decision = 'FAIL';

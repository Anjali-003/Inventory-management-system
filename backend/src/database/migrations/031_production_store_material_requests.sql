-- Material is deducted from inventory at Operations approval. Store allocation below
-- records physical handover only; it must never deduct inventory a second time.

-- Old reservation quantities are no longer used by the production workflow.
UPDATE inventory SET quantity_reserved = 0 WHERE quantity_reserved <> 0;

CREATE TABLE IF NOT EXISTS production_material_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  order_item_id INT NOT NULL,
  requested_by INT NOT NULL,
  request_key VARCHAR(64) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pmr_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmr_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmr_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT chk_pmr_status CHECK (status IN ('PENDING', 'PARTIALLY_ISSUED', 'ISSUED')),
  UNIQUE KEY uq_pmr_request_key (request_key),
  KEY idx_pmr_status_created (status, created_at),
  KEY idx_pmr_order_item (order_item_id, created_at)
);

CREATE TABLE IF NOT EXISTS production_material_request_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  component_id INT NOT NULL,
  requested_quantity DECIMAL(12,2) NOT NULL,
  issued_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pmri_request FOREIGN KEY (request_id) REFERENCES production_material_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmri_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT chk_pmri_requested CHECK (requested_quantity > 0),
  CONSTRAINT chk_pmri_issued CHECK (issued_quantity >= 0 AND issued_quantity <= requested_quantity),
  UNIQUE KEY uq_pmri_request_component (request_id, component_id),
  KEY idx_pmri_component (component_id)
);

CREATE TABLE IF NOT EXISTS production_material_issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_item_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  issued_by INT NOT NULL,
  remarks VARCHAR(255) NULL,
  idempotency_key VARCHAR(64) NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pmi_request_item FOREIGN KEY (request_item_id) REFERENCES production_material_request_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmi_issued_by FOREIGN KEY (issued_by) REFERENCES users(id),
  CONSTRAINT chk_pmi_quantity CHECK (quantity > 0),
  UNIQUE KEY uq_pmi_idempotency_item (idempotency_key, request_item_id),
  KEY idx_pmi_request_item_date (request_item_id, issued_at)
);

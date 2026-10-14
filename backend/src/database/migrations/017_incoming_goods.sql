-- Incoming goods flow:  Purchase Manager buys  ->  IQC inspects  ->  Store Manager accepts  ->  stock.
--
-- purchase_orders.status
--   PENDING_IQC    purchase raised, waiting for the IQC manager
--   PENDING_STORE  IQC approved (some or all of it), waiting for the store manager to accept
--   STORED         store manager accepted: approved quantities are now in inventory
--   REJECTED       IQC approved nothing (everything defective / nothing received)
--
-- purchase_order_items: quantity_ordered is filled by purchase; received / defective / approved by IQC.
--   quantity_approved = quantity_received - quantity_defective  (this is what goes into stock).

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    supplier VARCHAR(150) NOT NULL,
    notes VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING_IQC',

    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    iqc_by INT NULL,
    iqc_at DATETIME NULL,
    iqc_remarks VARCHAR(500) NULL,

    accepted_by INT NULL,
    accepted_at DATETIME NULL,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT chk_po_status CHECK (status IN ('PENDING_IQC', 'PENDING_STORE', 'STORED', 'REJECTED')),
    CONSTRAINT fk_po_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_po_iqc_by FOREIGN KEY (iqc_by) REFERENCES users(id),
    CONSTRAINT fk_po_accepted_by FOREIGN KEY (accepted_by) REFERENCES users(id),
    KEY idx_po_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL,
    component_id INT NOT NULL,

    quantity_ordered DECIMAL(12,2) NOT NULL,
    quantity_received DECIMAL(12,2) NULL,
    quantity_defective DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantity_approved DECIMAL(12,2) NULL,
    remarks VARCHAR(255) NULL,

    CONSTRAINT chk_poi_ordered CHECK (quantity_ordered > 0),
    CONSTRAINT fk_poi_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    CONSTRAINT fk_poi_component FOREIGN KEY (component_id) REFERENCES components(id),
    CONSTRAINT uq_poi_po_component UNIQUE (purchase_order_id, component_id)
);

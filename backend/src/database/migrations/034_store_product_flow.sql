-- Store and dispatch flow after Quality Control. One owner per step:
--   PACKAGING   (QC & FG Manager packs)          -> PACKED
--   PACKED      (Operations Admin hands over)    -> HANDED_OVER
--   HANDED_OVER (Store Manager receives)         -> IN_STORE     product stock +qty
--   IN_STORE    (Marketing Manager makes bill)   -> BILLED
--   BILLED      (Store Manager gives goods out)  -> DISPATCHED   product stock -qty
--   DISPATCHED  (Marketing Manager confirms)     -> DELIVERED    order COMPLETED
-- finished_goods has no rows yet, so the old DISPATCHED -> COMPLETED columns are simply left unused.

ALTER TABLE finished_goods
  ADD COLUMN packed_at DATETIME NULL,
  ADD COLUMN packed_by INT NULL,
  ADD COLUMN handed_over_at DATETIME NULL,
  ADD COLUMN handed_over_by INT NULL,
  ADD COLUMN received_at DATETIME NULL,
  ADD COLUMN received_by INT NULL,
  ADD COLUMN dispatch_note VARCHAR(255) NULL,
  ADD COLUMN delivered_at DATETIME NULL,
  ADD COLUMN delivered_by INT NULL,
  ADD COLUMN delivery_note VARCHAR(255) NULL;

-- Product inventory (finished products held by Store). The ledger is append-only, like inventory_transactions.
CREATE TABLE IF NOT EXISTS product_stock (
  product_id INT PRIMARY KEY,
  quantity_on_hand INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_stock_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_product_stock_qty CHECK (quantity_on_hand >= 0)
);

CREATE TABLE IF NOT EXISTS product_stock_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  direction VARCHAR(3) NOT NULL,
  quantity INT NOT NULL,
  balance_after INT NOT NULL,
  finished_goods_id INT NULL,
  order_id INT NULL,
  reason VARCHAR(255) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pst_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_pst_finished_goods FOREIGN KEY (finished_goods_id) REFERENCES finished_goods(id),
  CONSTRAINT fk_pst_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_pst_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_pst_direction CHECK (direction IN ('IN', 'OUT')),
  CONSTRAINT chk_pst_quantity CHECK (quantity > 0),
  KEY idx_pst_product_created (product_id, created_at, id)
);

-- Marketing's bill for one finished-goods record (one bill per order).
CREATE TABLE IF NOT EXISTS bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_number VARCHAR(30) NOT NULL,
  finished_goods_id INT NOT NULL,
  order_id INT NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_address VARCHAR(500) NULL,
  customer_gstin VARCHAR(20) NULL,
  gst_percent DECIMAL(5,2) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  gst_amount DECIMAL(14,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  notes VARCHAR(500) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bills_finished_goods FOREIGN KEY (finished_goods_id) REFERENCES finished_goods(id),
  CONSTRAINT fk_bills_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_bills_user FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_bills_number (bill_number),
  UNIQUE KEY uq_bills_finished_goods (finished_goods_id)
);

CREATE TABLE IF NOT EXISTS bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_bill_items_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_bill_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_bill_items_quantity CHECK (quantity > 0),
  CONSTRAINT chk_bill_items_rate CHECK (rate >= 0)
);

-- Extra components for pieces damaged during production / rework. Production asks with a reason,
-- Store issues it (a real stock-out in the component ledger) or rejects it with a note.
CREATE TABLE IF NOT EXISTS extra_material_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  component_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  reason_code VARCHAR(30) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  requested_by INT NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(255) NULL,
  inventory_transaction_id INT NULL,
  CONSTRAINT fk_emr_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_emr_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_emr_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_emr_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
  CONSTRAINT chk_emr_quantity CHECK (quantity > 0),
  CONSTRAINT chk_emr_status CHECK (status IN ('PENDING', 'ISSUED', 'REJECTED')),
  KEY idx_emr_status_requested (status, requested_at)
);

-- QC checks random sample pieces of a batch; one failed piece fails the whole batch.
ALTER TABLE quality_control_batch_decisions
  ADD COLUMN sample_size INT NULL AFTER decision,
  ADD COLUMN sample_failed INT NULL AFTER sample_size;

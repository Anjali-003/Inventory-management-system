-- Operations Admin dispatch:  for a pending order the admin sees what can be built from the stock on the shelf, then in ONE
-- step approves the order and sends
--   * the producible quantities           -> order_production_items  (read by the Production Manager)
--   * the missing components to be bought -> order_purchase_items    (shown to the Purchase Manager on "Approved orders")
-- Both tables hold exactly what the admin saw and sent (one row per product / component), so they are a record of that decision.

CREATE TABLE IF NOT EXISTS order_production_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  sent_by INT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_opi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_opi_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_opi_sent_by FOREIGN KEY (sent_by) REFERENCES users(id),
  CONSTRAINT uq_opi_order_product UNIQUE (order_id, product_id),
  CONSTRAINT chk_opi_quantity CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  component_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  sent_by INT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_opu_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_opu_component FOREIGN KEY (component_id) REFERENCES components(id),
  CONSTRAINT fk_opu_sent_by FOREIGN KEY (sent_by) REFERENCES users(id),
  CONSTRAINT uq_opu_order_component UNIQUE (order_id, component_id),
  CONSTRAINT chk_opu_quantity CHECK (quantity > 0)
);

-- Stock-out reasons become structured so the Inventory History balance sheet can group a shortfall
-- by cause (damaged, R&D, ...) and name the worker involved.
-- Old rows keep NULL here; the history report falls back to reading their free-text reason.
-- (ALTER is fine with the append-only triggers: they only block UPDATE / DELETE of rows.)
ALTER TABLE inventory_transactions
  ADD COLUMN reason_code VARCHAR(30) NULL AFTER reason,
  ADD COLUMN employee_id INT NULL AFTER created_by,
  ADD KEY idx_inv_txn_reason_code (reason_code),
  ADD CONSTRAINT fk_inv_txn_employee FOREIGN KEY (employee_id) REFERENCES employees(id);

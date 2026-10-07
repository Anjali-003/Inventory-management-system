-- Stock-outs are now tied to an ORDER instead of a worker.
-- New stock-out rows carry order_id; the Inventory History balance sheet shows the order number.
-- Old rows keep their employee_id (history is never rewritten) and order_id stays NULL for them.
-- (ALTER is fine with the append-only triggers: they only block UPDATE / DELETE of rows.)
ALTER TABLE inventory_transactions
  ADD COLUMN order_id INT NULL AFTER employee_id,
  ADD KEY idx_inv_txn_order (order_id),
  ADD CONSTRAINT fk_inv_txn_order FOREIGN KEY (order_id) REFERENCES orders(id);

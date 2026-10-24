-- Quantity revision:  the Operations Admin can say "we will make only this much of the order for now".
--   PENDING_APPROVAL  --revise-->  QUANTITY_REVISED  (waiting for the Marketing Manager to agree)
--   QUANTITY_REVISED  --accept-->  PENDING_APPROVAL  (back in the admin's queue with the reduced quantities)
-- On revise the order is split in two:
--   * the original order keeps only the quantities the admin will make (order_items.quantity is lowered,
--     lines brought down to 0 are removed);
--   * the rest becomes a NEW marketing draft (parent_order_id = the original), so the Marketing Manager keeps
--     both copies and can send the held-back part again later.
-- `revision` keeps what was asked vs. what was agreed per product, so the full picture survives the split.

ALTER TABLE orders DROP CHECK chk_orders_approval_status;

ALTER TABLE orders
  ADD COLUMN parent_order_id INT NULL AFTER order_number,
  ADD COLUMN revision JSON NULL AFTER approval_remarks,
  ADD COLUMN revised_by INT NULL AFTER revision,
  ADD COLUMN revised_at DATETIME NULL AFTER revised_by,
  ADD COLUMN revision_accepted_by INT NULL AFTER revised_at,
  ADD COLUMN revision_accepted_at DATETIME NULL AFTER revision_accepted_by,
  ADD CONSTRAINT fk_orders_parent FOREIGN KEY (parent_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_orders_revised_by FOREIGN KEY (revised_by) REFERENCES users(id),
  ADD CONSTRAINT fk_orders_revision_accepted_by FOREIGN KEY (revision_accepted_by) REFERENCES users(id),
  ADD CONSTRAINT chk_orders_approval_status
    CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'QUANTITY_REVISED', 'APPROVED', 'REJECTED'));

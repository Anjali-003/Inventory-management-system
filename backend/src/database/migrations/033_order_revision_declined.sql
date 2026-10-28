-- Marketing can decline the Operations Admin's reduced quantity: the order becomes CANCELLED.
ALTER TABLE orders DROP CHECK chk_orders_approval_status;
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_approval_status
  CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'QUANTITY_REVISED', 'APPROVED', 'REJECTED', 'CANCELLED'));

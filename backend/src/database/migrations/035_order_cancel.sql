-- Operations Admin / Super Admin can cancel an APPROVED order before production starts (order-approval.service.js cancel()).
-- The components the approval took out of stock come back as RETURNED_FROM_ORDER ledger rows; the order keeps its history.
ALTER TABLE orders DROP CHECK chk_orders_approval_status;
ALTER TABLE orders
  ADD CONSTRAINT chk_orders_approval_status
  CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'QUANTITY_REVISED', 'APPROVED', 'REJECTED', 'CANCELLED'));

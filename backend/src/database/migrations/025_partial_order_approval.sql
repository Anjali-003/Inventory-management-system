-- Distinguish orders for which Operations approved only a subset of the ordered quantities.
ALTER TABLE orders DROP CHECK chk_orders_approval_status;

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_approval_status
    CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED'));

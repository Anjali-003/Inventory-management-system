-- Partial approval is gone: an order is approved as a whole or rejected.
-- Orders that were left PARTIALLY_APPROVED become APPROVED (what was already sent to production / purchase stays as it is).
UPDATE orders SET approval_status = 'APPROVED' WHERE approval_status = 'PARTIALLY_APPROVED';

ALTER TABLE orders DROP CHECK chk_orders_approval_status;

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_approval_status
    CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'));

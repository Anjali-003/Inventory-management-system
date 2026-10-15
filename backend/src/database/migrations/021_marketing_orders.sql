-- Marketing Manager step BEFORE approval:
--   DRAFT             marketing manager is still preparing the order (only marketing sees it)
--   PENDING_APPROVAL  marketing pressed "Send to Operations Admin"  -> now in the admin's queue
-- (APPROVED / REJECTED are unchanged, see 020). Orders raised by a super admin skip DRAFT.

ALTER TABLE orders DROP CHECK chk_orders_approval_status;

ALTER TABLE orders
  ADD COLUMN sent_to_admin_at DATETIME NULL AFTER approval_status,
  ADD CONSTRAINT chk_orders_approval_status CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'));

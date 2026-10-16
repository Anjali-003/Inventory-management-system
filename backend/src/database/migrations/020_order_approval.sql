-- Order approval step:  Marketing/Super admin raises an order  ->  Operations Admin approves or rejects it
--                       ->  approved orders show up for the Purchase Manager (and production may start).
--
-- orders.status         stays the PRODUCTION status (PENDING, IN_PRODUCTION, ...), untouched.
-- orders.approval_status
--   PENDING_APPROVAL    waiting for the Operations Admin (every NEW order starts here)
--   APPROVED            Operations Admin approved it: visible to the Purchase Manager, production can start
--   REJECTED            Operations Admin rejected it (remarks are mandatory)

ALTER TABLE orders
  ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_APPROVAL' AFTER status,
  ADD COLUMN approval_remarks VARCHAR(500) NULL AFTER approval_status,
  ADD COLUMN approved_by INT NULL AFTER approval_remarks,
  ADD COLUMN approved_at DATETIME NULL AFTER approved_by,
  ADD CONSTRAINT fk_orders_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
  ADD CONSTRAINT chk_orders_approval_status CHECK (approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  ADD KEY idx_orders_approval (approval_status, created_at);

-- Orders that existed before this step keep working exactly as before: they count as approved.
UPDATE orders SET approval_status = 'APPROVED', approved_at = created_at;

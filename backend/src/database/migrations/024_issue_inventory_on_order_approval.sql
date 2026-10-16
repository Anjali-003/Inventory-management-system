-- New approvals issue their BOM materials immediately. NULL identifies orders
-- approved before this behavior so their existing production flow stays intact.
ALTER TABLE orders
  ADD COLUMN inventory_issued_at DATETIME NULL AFTER approved_at;

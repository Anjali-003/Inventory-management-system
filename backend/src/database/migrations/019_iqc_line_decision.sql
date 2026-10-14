-- IQC now approves or rejects each COMPONENT line of a purchase (a tick box per line).
--   APPROVED  goes to the store manager (quantity_approved = received - defective)
--   REJECTED  stays with IQC; quantity_approved = 0 (the IQC screen can export these to Excel)
-- NULL = not inspected yet. Lines inspected before this migration are filled in from their approved quantity.

ALTER TABLE purchase_order_items
  ADD COLUMN iqc_decision VARCHAR(10) NULL AFTER quantity_approved,
  ADD CONSTRAINT chk_poi_decision CHECK (iqc_decision IS NULL OR iqc_decision IN ('APPROVED', 'REJECTED'));

UPDATE purchase_order_items
   SET iqc_decision = IF(quantity_approved > 0, 'APPROVED', 'REJECTED')
 WHERE quantity_received IS NOT NULL;

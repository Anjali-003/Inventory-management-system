-- The date the supplier promised to deliver a purchase order. Shows late deliveries on the Purchase page and the
-- per-supplier delay in Reports. Old purchase orders keep NULL (no promise recorded).
ALTER TABLE purchase_orders ADD COLUMN expected_delivery_date DATE NULL AFTER notes;

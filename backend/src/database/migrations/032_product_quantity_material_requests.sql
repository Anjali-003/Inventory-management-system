-- Track material requests and physical allotments in units of finished products.
-- Component quantities are snapshotted per product so later BOM edits do not alter existing requests.
ALTER TABLE production_material_requests
  ADD COLUMN requested_product_quantity DECIMAL(12,2) NULL AFTER order_item_id,
  ADD COLUMN issued_product_quantity DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER requested_product_quantity;

ALTER TABLE production_material_request_items
  ADD COLUMN quantity_per_product DECIMAL(12,2) NULL AFTER component_id;

-- Existing requests remain in legacy component-allotment mode (NULL product quantity).
-- New requests save product quantities and per-product component ratios through the service.
UPDATE production_material_request_items ri
JOIN production_material_requests r ON r.id = ri.request_id
JOIN order_items oi ON oi.id = r.order_item_id
JOIN product_bom pb ON pb.product_id = oi.product_id AND pb.component_id = ri.component_id
SET ri.quantity_per_product = pb.quantity_required
WHERE ri.quantity_per_product IS NULL AND pb.quantity_required > 0;

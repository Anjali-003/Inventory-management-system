-- PRD-001 BOM: every blank (NULL) quantity and every decimal quantity (e.g. 0.1) becomes 1.
-- Run on the existing database:
--   mysql --default-character-set=utf8mb4 -u <user> -p inventory_management < 05_set_prd001_blank_and_decimal_bom_to_1.sql

USE inventory_management;

-- 1) Preview: the lines that will change
SELECT b.id, c.sku, c.name, b.quantity_required AS old_quantity
  FROM product_bom b
  JOIN products p   ON p.id = b.product_id
  JOIN components c ON c.id = b.component_id
 WHERE p.sku = 'PRD-001'
   AND (b.quantity_required IS NULL OR b.quantity_required <> FLOOR(b.quantity_required));

-- 2) Update
UPDATE product_bom b
  JOIN products p ON p.id = b.product_id
   SET b.quantity_required = 1
 WHERE p.sku = 'PRD-001'
   AND (b.quantity_required IS NULL OR b.quantity_required <> FLOOR(b.quantity_required));

-- 3) Check: should return no rows
SELECT b.id, c.sku, b.quantity_required
  FROM product_bom b
  JOIN products p   ON p.id = b.product_id
  JOIN components c ON c.id = b.component_id
 WHERE p.sku = 'PRD-001'
   AND (b.quantity_required IS NULL OR b.quantity_required <> FLOOR(b.quantity_required));

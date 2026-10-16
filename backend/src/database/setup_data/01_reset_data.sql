
-- =====================================================================
-- 01_reset_data.sql
-- Development data reset
--
-- WARNING: This permanently deletes selected business data.
--
-- Preserved:
--   users, employees, attendance, schema_migrations
--
-- Reset:
--   products, components, inventory, inventory_transactions,
--   product_bom, purchase_orders, purchase_order_items,
--   order_purchase_items, orders, order_items,
--   production_orders, testing_records,
--   quality_control_records, finished_goods
-- =====================================================================

USE inventory_management;

-- 1. Stock ledger
TRUNCATE TABLE inventory_transactions;

-- 2. Operations
DELETE FROM finished_goods;
ALTER TABLE finished_goods AUTO_INCREMENT = 1;

DELETE FROM quality_control_records;
ALTER TABLE quality_control_records AUTO_INCREMENT = 1;

DELETE FROM testing_records;
ALTER TABLE testing_records AUTO_INCREMENT = 1;

-- 3. Purchase-order dependent tables first
DELETE FROM purchase_order_items;
ALTER TABLE purchase_order_items AUTO_INCREMENT = 1;

DELETE FROM order_purchase_items;
ALTER TABLE order_purchase_items AUTO_INCREMENT = 1;

-- 4. Purchase orders after their known child tables
DELETE FROM purchase_orders;
ALTER TABLE purchase_orders AUTO_INCREMENT = 1;

-- 5. Sales orders
-- These depend on the actual FK cascade configuration.
DELETE FROM orders;
ALTER TABLE orders AUTO_INCREMENT = 1;

ALTER TABLE order_items AUTO_INCREMENT = 1;
ALTER TABLE production_orders AUTO_INCREMENT = 1;

-- 6. Inventory
DELETE FROM inventory;
ALTER TABLE inventory AUTO_INCREMENT = 1;

-- 7. BOM records
DELETE FROM product_bom;
ALTER TABLE product_bom AUTO_INCREMENT = 1;

-- 8. Components
DELETE FROM components;
ALTER TABLE components AUTO_INCREMENT = 1;

-- 9. Products
DELETE FROM products;
ALTER TABLE products AUTO_INCREMENT = 1;

-- 10. Verify
SELECT
    (SELECT COUNT(*) FROM products) AS products,
    (SELECT COUNT(*) FROM components) AS components,
    (SELECT COUNT(*) FROM inventory) AS inventory_rows,
    (SELECT COUNT(*) FROM inventory_transactions) AS ledger_rows,
    (SELECT COUNT(*) FROM product_bom) AS bom_rows,
    (SELECT COUNT(*) FROM purchase_orders) AS purchase_orders,
    (SELECT COUNT(*) FROM purchase_order_items) AS purchase_order_items,
    (SELECT COUNT(*) FROM order_purchase_items) AS order_purchase_items,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM order_items) AS order_items,
    (SELECT COUNT(*) FROM production_orders) AS production_orders,
    (SELECT COUNT(*) FROM testing_records) AS testing_records,
    (SELECT COUNT(*) FROM quality_control_records) AS qc_records,
    (SELECT COUNT(*) FROM finished_goods) AS finished_goods;

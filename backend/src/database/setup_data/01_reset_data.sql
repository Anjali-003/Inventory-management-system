-- =====================================================================
-- reset_inventory.sql
-- Start from zero: clears the stock ledger, all stock rows, the demo
-- Orders / Production data, the demo Components AND the Products.
--
-- THIS CANNOT BE UNDONE. Take a backup first:
--   mysqldump -u <user> -p inventory_management products components inventory inventory_transactions product_bom orders order_items production_orders > backup.sql
--
-- Run:  mysql -u <user> -p inventory_management < reset_inventory.sql
--
-- Why TRUNCATE on the ledger: migration 006 blocks DELETE/UPDATE on
-- inventory_transactions with triggers. TRUNCATE does not fire them, and
-- no table has a foreign key pointing at inventory_transactions.
--
-- Components cannot be truncated (other tables point at them), so they are
-- removed with DELETE, children first:
--   inventory_transactions -> inventory -> product_bom -> components / products
--
-- NOTE: product_bom rows are deleted too, because each one points at a
-- component. Products are deleted as well, so there is no BOM left at all
-- until you add the new products/components and rebuild it. The BOM module
-- belongs to another team member, so tell them before running this.
--
-- Not touched: users, employees, attendance.
-- Do NOT re-run seed.sql afterwards: it would re-create the demo
-- components, stock and opening balances. Load the new data with
-- insert_components.sql instead.
-- =====================================================================

USE inventory_management;

-- 1) Orders and Production (order_items / production_orders go with orders: ON DELETE CASCADE)
DELETE FROM orders;
ALTER TABLE orders AUTO_INCREMENT = 1;
ALTER TABLE order_items AUTO_INCREMENT = 1;
ALTER TABLE production_orders AUTO_INCREMENT = 1;

-- 2) Whole stock ledger (opening balance, stock in, adjustments, reservations, ...)
TRUNCATE TABLE inventory_transactions;

-- 3) Stock rows
DELETE FROM inventory;
ALTER TABLE inventory AUTO_INCREMENT = 1;

-- 4) BOM rows (they reference components, so they must go before the components)
DELETE FROM product_bom;
ALTER TABLE product_bom AUTO_INCREMENT = 1;

-- 5) Components; ids and SKU suggestions (CMP-001, ...) start again from 1
DELETE FROM components;
ALTER TABLE components AUTO_INCREMENT = 1;

-- 6) Products (order_items and product_bom are already empty, so nothing points at them)
DELETE FROM products;
ALTER TABLE products AUTO_INCREMENT = 1;

-- ---------------------------------------------------------------------
-- Check (expect: all zeros)
-- ---------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM products)               AS products,
       (SELECT COUNT(*) FROM components)             AS components,
       (SELECT COUNT(*) FROM inventory)              AS inventory_rows,
       (SELECT COUNT(*) FROM inventory_transactions) AS ledger_rows,
       (SELECT COUNT(*) FROM product_bom)            AS bom_rows,
       (SELECT COUNT(*) FROM orders)                 AS orders,
       (SELECT COUNT(*) FROM production_orders)      AS production_orders;

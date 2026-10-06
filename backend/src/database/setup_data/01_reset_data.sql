-- =====================================================================
-- 01_reset_data.sql
-- Start from zero for the "Catalog" and "Operations" sections of the app.
--
--   Catalog     : Products, Inventory, Inventory History
--                 -> products, components, inventory, inventory_transactions, product_bom
--   Operations  : Orders, Production, Quality Control, Finished Goods
--                 -> orders, order_items, production_orders,
--                    testing_records, quality_control_records, finished_goods
--
-- THIS CANNOT BE UNDONE. Take a backup first:
--   mysqldump -u <user> -p inventory_management products components inventory inventory_transactions product_bom orders order_items production_orders testing_records quality_control_records finished_goods > backup.sql
--
-- Run:  mysql -u <user> -p inventory_management < 01_reset_data.sql
--
-- Order matters (children first), because foreign keys block the delete otherwise:
--   finished_goods, quality_control_records, testing_records   -> production_orders / orders
--   orders (order_items and production_orders go with it: ON DELETE CASCADE)
--   inventory_transactions -> inventory -> product_bom -> components / products
--
-- Why TRUNCATE only on the ledger: migration 006 blocks DELETE/UPDATE on
-- inventory_transactions with triggers. TRUNCATE does not fire them, and no
-- table has a foreign key pointing at inventory_transactions. Every other
-- table is referenced by a foreign key, so MySQL refuses TRUNCATE on it;
-- those use DELETE + AUTO_INCREMENT = 1.
--
-- Not touched: users, employees, attendance, schema_migrations.
-- Do NOT re-run seed.sql afterwards: it would re-create the demo components,
-- stock and opening balances. Load the new data with 02_ to 04_ instead.
-- =====================================================================

USE inventory_management;

-- 1) Operations: everything that hangs off production orders and orders
DELETE FROM finished_goods;
ALTER TABLE finished_goods AUTO_INCREMENT = 1;

DELETE FROM quality_control_records;
ALTER TABLE quality_control_records AUTO_INCREMENT = 1;

DELETE FROM testing_records;
ALTER TABLE testing_records AUTO_INCREMENT = 1;

-- orders last: order_items and production_orders are deleted with them (ON DELETE CASCADE)
DELETE FROM orders;
ALTER TABLE orders AUTO_INCREMENT = 1;
ALTER TABLE order_items AUTO_INCREMENT = 1;
ALTER TABLE production_orders AUTO_INCREMENT = 1;

-- 2) Catalog: whole stock ledger (opening balance, stock in, adjustments, reservations, ...)
--    This is also what the Inventory History page reads.
TRUNCATE TABLE inventory_transactions;

-- 3) Stock rows
DELETE FROM inventory;
ALTER TABLE inventory AUTO_INCREMENT = 1;

-- 4) BOM rows (they reference components and products, so they go first)
DELETE FROM product_bom;
ALTER TABLE product_bom AUTO_INCREMENT = 1;

-- 5) Components; ids and SKU suggestions (CMP-0001, ...) start again from 1
DELETE FROM components;
ALTER TABLE components AUTO_INCREMENT = 1;

-- 6) Products (order_items and product_bom are already empty, so nothing points at them)
DELETE FROM products;
ALTER TABLE products AUTO_INCREMENT = 1;

-- ---------------------------------------------------------------------
-- Check (expect: all zeros)
-- ---------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM products)                AS products,
       (SELECT COUNT(*) FROM components)              AS components,
       (SELECT COUNT(*) FROM inventory)               AS inventory_rows,
       (SELECT COUNT(*) FROM inventory_transactions)  AS ledger_rows,
       (SELECT COUNT(*) FROM product_bom)             AS bom_rows,
       (SELECT COUNT(*) FROM orders)                  AS orders,
       (SELECT COUNT(*) FROM order_items)             AS order_items,
       (SELECT COUNT(*) FROM production_orders)       AS production_orders,
       (SELECT COUNT(*) FROM testing_records)         AS testing_records,
       (SELECT COUNT(*) FROM quality_control_records) AS qc_records,
       (SELECT COUNT(*) FROM finished_goods)          AS finished_goods;


-- =====================================================================
-- 01_reset_data.sql
-- Development data reset
--
-- WARNING: This permanently deletes selected business data.
--
-- Preserved:
--   users (logins), schema_migrations
--
-- Reset:
--   products, components, inventory, inventory_transactions,
--   product_bom, purchase_orders, purchase_order_items,
--   order_purchase_items, order_production_items, orders, order_items,
--   production_material_requests (+ their items and issues),
--   production_orders, testing_records,
--   quality_control_records, quality_control_batch_decisions, quality_control_rework_cycles, finished_goods,
--   bills (+ bill_items, bill_payments, bill_credit_notes), customers, product_stock (+ its ledger),
--   extra_material_requests,
--   notifications, notification_reads, activity_log, idempotency_keys,
--   attendance, employees
--
-- Load again with `npm run seed`: 02..05 bring back products / components / stock / BOMs,
-- 06_insert_employees.sql brings back the employees. Attendance, notifications and the
-- activity feed start empty and are collected again from the moment of the reset.
-- =====================================================================

USE inventory_management;

-- 1. Stock ledger (references components, orders and employees, so it goes first)
TRUNCATE TABLE inventory_transactions;

-- 1b. Notifications, activity feed, idempotency keys (reads are deleted with their notification)
DELETE FROM notification_reads;
DELETE FROM notifications;
ALTER TABLE notifications AUTO_INCREMENT = 1;

DELETE FROM activity_log;
ALTER TABLE activity_log AUTO_INCREMENT = 1;

DELETE FROM idempotency_keys;
ALTER TABLE idempotency_keys AUTO_INCREMENT = 1;

-- 1c. Money and product stock (they reference finished goods, orders and products, so before those)
DELETE FROM bill_payments;
ALTER TABLE bill_payments AUTO_INCREMENT = 1;

DELETE FROM bill_credit_notes;
ALTER TABLE bill_credit_notes AUTO_INCREMENT = 1;

DELETE FROM bill_items;
ALTER TABLE bill_items AUTO_INCREMENT = 1;

DELETE FROM bills;
ALTER TABLE bills AUTO_INCREMENT = 1;

DELETE FROM customers;
ALTER TABLE customers AUTO_INCREMENT = 1;

DELETE FROM product_stock_transactions;
ALTER TABLE product_stock_transactions AUTO_INCREMENT = 1;

DELETE FROM product_stock;

-- 1d. Extra material asked for damaged pieces (references orders and components)
DELETE FROM extra_material_requests;
ALTER TABLE extra_material_requests AUTO_INCREMENT = 1;

-- 2. Operations
-- QC decisions and rework cycles reference production runs, which go with their orders below
DELETE FROM quality_control_rework_cycles;
ALTER TABLE quality_control_rework_cycles AUTO_INCREMENT = 1;

DELETE FROM quality_control_batch_decisions;
ALTER TABLE quality_control_batch_decisions AUTO_INCREMENT = 1;

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

-- 4b. Production material requests (children first; they reference orders and components)
DELETE FROM production_material_issues;
ALTER TABLE production_material_issues AUTO_INCREMENT = 1;

DELETE FROM production_material_request_items;
ALTER TABLE production_material_request_items AUTO_INCREMENT = 1;

DELETE FROM production_material_requests;
ALTER TABLE production_material_requests AUTO_INCREMENT = 1;

-- 5. Sales orders
-- These depend on the actual FK cascade configuration.
DELETE FROM orders;
ALTER TABLE orders AUTO_INCREMENT = 1;

ALTER TABLE order_items AUTO_INCREMENT = 1;
ALTER TABLE order_production_items AUTO_INCREMENT = 1;
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

-- 10. HR: attendance first (it references employees)
DELETE FROM attendance;
ALTER TABLE attendance AUTO_INCREMENT = 1;

DELETE FROM employees;
ALTER TABLE employees AUTO_INCREMENT = 1;

-- 11. Verify
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
    (SELECT COUNT(*) FROM finished_goods) AS finished_goods,
    (SELECT COUNT(*) FROM bills) AS bills,
    (SELECT COUNT(*) FROM product_stock) AS product_stock_rows,
    (SELECT COUNT(*) FROM extra_material_requests) AS extra_material_requests,
    (SELECT COUNT(*) FROM production_material_requests) AS material_requests,
    (SELECT COUNT(*) FROM notifications) AS notifications,
    (SELECT COUNT(*) FROM activity_log) AS activity_rows,
    (SELECT COUNT(*) FROM attendance) AS attendance_rows,
    (SELECT COUNT(*) FROM employees) AS employees;

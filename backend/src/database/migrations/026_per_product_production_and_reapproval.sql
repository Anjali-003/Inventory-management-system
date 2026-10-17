-- 1) Production runs belong to an order AND a product, so one order can carry several products and each one
--    is produced, tested, QC'd and boxed on its own (testing_records, quality_control_records and finished_goods
--    already point at production_orders.id, so they follow automatically).
ALTER TABLE production_orders ADD COLUMN product_id INT NULL AFTER order_id;

-- existing runs belong to the order's first product line (older orders only ever ran one product)
UPDATE production_orders po
JOIN (SELECT order_id, MIN(id) AS first_item_id FROM order_items GROUP BY order_id) f ON f.order_id = po.order_id
JOIN order_items oi ON oi.id = f.first_item_id
SET po.product_id = oi.product_id;

ALTER TABLE production_orders
  MODIFY product_id INT NOT NULL,
  ADD CONSTRAINT fk_production_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
  ADD UNIQUE KEY uq_production_order_product (order_id, product_id);

-- drop the old "one run per order" unique key, whatever it is called in this database
SET @old_key = (
  SELECT s.INDEX_NAME FROM information_schema.STATISTICS s
  WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'production_orders'
    AND s.NON_UNIQUE = 0 AND s.INDEX_NAME NOT IN ('PRIMARY', 'uq_production_order_product')
  GROUP BY s.INDEX_NAME
  HAVING COUNT(*) = 1 AND MAX(s.COLUMN_NAME) = 'order_id'
  LIMIT 1
);
SET @drop_sql = IF(@old_key IS NULL, 'SELECT 1', CONCAT('ALTER TABLE production_orders DROP INDEX `', @old_key, '`'));
PREPARE drop_old_key FROM @drop_sql;
EXECUTE drop_old_key;
DEALLOCATE PREPARE drop_old_key;

-- 2) An order that was only partly approved can be approved again for the rest. Each approval pass gets its own
--    number, used in the inventory ledger's idempotency key so a second pass never collides with the first.
ALTER TABLE orders ADD COLUMN approval_round INT NOT NULL DEFAULT 0 AFTER inventory_issued_at;
UPDATE orders SET approval_round = 1 WHERE inventory_issued_at IS NOT NULL;

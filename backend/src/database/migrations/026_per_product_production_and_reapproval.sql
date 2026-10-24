
-- 026_per_product_production_and_reapproval.sql
--
-- 1) Production runs belong to an order and a product.
-- Existing production runs are assigned to the first product line
-- only when product_id is NULL.
--
-- 2) Add approval_round to support distinct approval passes.

-- Step 1: Add product_id only if it does not already exist.
SET @has_product_id = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_orders'
    AND COLUMN_NAME = 'product_id'
);

SET @sql = IF(
  @has_product_id = 0,
  'ALTER TABLE production_orders ADD COLUMN product_id INT NULL AFTER order_id',
  'SELECT ''product_id already exists'' AS migration_note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 2: Backfill missing product_id values from the first order item.
-- Existing non-NULL product_id values are preserved.
UPDATE production_orders po
JOIN (
  SELECT order_id, MIN(id) AS first_item_id
  FROM order_items
  GROUP BY order_id
) first_item ON first_item.order_id = po.order_id
JOIN order_items oi ON oi.id = first_item.first_item_id
SET po.product_id = oi.product_id
WHERE po.product_id IS NULL;


-- Step 3: Verify there are no NULL product_id values before making
-- product_id NOT NULL. Do not silently assign an incorrect product.
SET @null_product_count = (
  SELECT COUNT(*)
  FROM production_orders
  WHERE product_id IS NULL
);

SET @sql = IF(
  @null_product_count = 0,
  'ALTER TABLE production_orders MODIFY COLUMN product_id INT NOT NULL',
  'SELECT ''WARNING: product_id still contains NULL values; NOT NULL change skipped'' AS migration_warning'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 4: Add the product foreign key only if it does not already exist.
SET @has_product_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_orders'
    AND CONSTRAINT_NAME = 'fk_production_orders_product'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql = IF(
  @has_product_fk = 0,
  'ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_product FOREIGN KEY (product_id) REFERENCES products(id)',
  'SELECT ''Product foreign key already exists'' AS migration_note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 5: Check whether duplicate (order_id, product_id) combinations
-- exist before adding the unique key.
SET @duplicate_pairs = (
  SELECT COUNT(*)
  FROM (
    SELECT order_id, product_id
    FROM production_orders
    GROUP BY order_id, product_id
    HAVING COUNT(*) > 1
  ) duplicates_found
);

SET @has_new_unique_key = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_orders'
    AND INDEX_NAME = 'uq_production_order_product'
);

SET @sql = IF(
  @has_new_unique_key > 0,
  'SELECT ''Unique order/product key already exists'' AS migration_note',
  IF(
    @duplicate_pairs = 0,
    'ALTER TABLE production_orders ADD UNIQUE KEY uq_production_order_product (order_id, product_id)',
    'SELECT ''WARNING: duplicate order/product pairs exist; unique key was not added. Resolve duplicates before continuing.'' AS migration_warning'
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 6: Drop the old single-column unique key on order_id, if present.
-- Do this only after the replacement unique key exists.
SET @has_new_unique_key = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_orders'
    AND INDEX_NAME = 'uq_production_order_product'
);

SET @old_key = (
  SELECT s.INDEX_NAME
  FROM information_schema.STATISTICS s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME = 'production_orders'
    AND s.NON_UNIQUE = 0
    AND s.INDEX_NAME <> 'PRIMARY'
    AND s.INDEX_NAME <> 'uq_production_order_product'
  GROUP BY s.INDEX_NAME
  HAVING COUNT(*) = 1
     AND MAX(s.COLUMN_NAME) = 'order_id'
  LIMIT 1
);

SET @sql = IF(
  @has_new_unique_key > 0 AND @old_key IS NOT NULL,
  CONCAT('ALTER TABLE production_orders DROP INDEX `', @old_key, '`'),
  'SELECT ''Old order_id unique key not dropped; replacement key may be missing or old key is absent'' AS migration_note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 7: Add approval_round only if it does not already exist.
SET @has_approval_round = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'approval_round'
);

SET @sql = IF(
  @has_approval_round = 0,
  'ALTER TABLE orders ADD COLUMN approval_round INT NOT NULL DEFAULT 0 AFTER inventory_issued_at',
  'SELECT ''approval_round already exists'' AS migration_note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Step 8: Initialize existing issued orders without overwriting
-- approval rounds that may already have been recorded.
UPDATE orders
SET approval_round = 1
WHERE inventory_issued_at IS NOT NULL
  AND approval_round = 0;

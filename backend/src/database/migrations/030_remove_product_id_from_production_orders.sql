-- Restore the per-order-item production model. Migration 026 introduced a second,
-- overlapping product identifier on production_orders; order_item_id remains canonical.
SET @has_product_fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'production_orders'
    AND CONSTRAINT_NAME = 'fk_production_orders_product' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(@has_product_fk > 0,
  'ALTER TABLE production_orders DROP FOREIGN KEY fk_production_orders_product',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_product_unique = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_orders'
    AND INDEX_NAME = 'uq_production_order_product'
);
SET @sql = IF(@has_product_unique > 0,
  'ALTER TABLE production_orders DROP INDEX uq_production_order_product',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_product_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_orders'
    AND COLUMN_NAME = 'product_id'
);
SET @sql = IF(@has_product_id > 0,
  'ALTER TABLE production_orders DROP COLUMN product_id',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

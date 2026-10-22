-- Remove the product_id model from production_orders.
-- Preserve order_item_id and approval_round.

SET @sql = IF(
    EXISTS (
        SELECT 1
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'production_orders'
          AND CONSTRAINT_NAME = 'fk_production_orders_product'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'ALTER TABLE production_orders DROP FOREIGN KEY fk_production_orders_product',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


SET @sql = IF(
    EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'production_orders'
          AND INDEX_NAME = 'uq_production_order_product'
    ),
    'ALTER TABLE production_orders DROP INDEX uq_production_order_product',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


SET @sql = IF(
    EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'production_orders'
          AND COLUMN_NAME = 'product_id'
    ),
    'ALTER TABLE production_orders DROP COLUMN product_id',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
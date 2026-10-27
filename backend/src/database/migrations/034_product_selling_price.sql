-- Price list: each product's selling price (without GST). An order's value is worked out from it.
-- Added only when missing: a database that already ran the later "money" migration has this column.
SET @has := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'selling_price');
SET @sql := IF(@has = 0, 'ALTER TABLE products ADD COLUMN selling_price DECIMAL(12,2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

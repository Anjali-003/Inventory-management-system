-- Every Marketing order is for a customer: picked from the saved list, or typed once and saved.
-- The table matches the later "customers" migration, so it is created only when missing.
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  gstin VARCHAR(20) NULL,
  phone VARCHAR(20) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_user FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_customers_name (name)
);

-- orders.customer_id (added only when missing)
SET @has := (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'customer_id');
SET @sql := IF(@has = 0,
  'ALTER TABLE orders ADD COLUMN customer_id INT NULL AFTER order_number, ADD CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

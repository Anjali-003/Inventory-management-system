-- Customers Marketing bills again and again: saved once, picked from a list on the next bill.
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

-- which saved customer a bill is for (NULL for bills typed by hand); the bill keeps its own copy of the details
ALTER TABLE bills
  ADD COLUMN customer_id INT NULL AFTER order_id,
  ADD CONSTRAINT fk_bills_customer FOREIGN KEY (customer_id) REFERENCES customers(id);

-- Money that the CEO can trust: a price list, payments received, what purchases cost, and bills that can be
-- cancelled (before the goods leave) or reduced by a credit note (after), always with a reason.

-- 1. Price list: Super Admin sets each product's selling price and GST %; the bill starts from them.
ALTER TABLE products
  ADD COLUMN selling_price DECIMAL(12,2) NULL,
  ADD COLUMN gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00;

-- each bill line keeps the list price it was billed against, its own GST, and why the rate is lower (discount)
ALTER TABLE bill_items
  ADD COLUMN list_price DECIMAL(12,2) NULL AFTER rate,
  ADD COLUMN gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER amount,
  ADD COLUMN gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER gst_percent,
  ADD COLUMN price_note VARCHAR(255) NULL;

-- 2. A cancelled bill is kept (with who / when / why) and the order can be billed again, so one order may have
--    several bills but only one ACTIVE: the unique key moves into the service.
ALTER TABLE bills
  ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN cancelled_by INT NULL,
  ADD COLUMN cancelled_at DATETIME NULL,
  ADD COLUMN cancel_reason VARCHAR(255) NULL,
  ADD KEY idx_bills_finished_goods (finished_goods_id),
  ADD KEY idx_bills_status_created (status, created_at),
  ADD CONSTRAINT fk_bills_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id),
  ADD CONSTRAINT chk_bills_status CHECK (status IN ('ACTIVE', 'CANCELLED'));
ALTER TABLE bills DROP INDEX uq_bills_finished_goods;

-- 3. Money received against a bill (part payments allowed).
CREATE TABLE IF NOT EXISTS bill_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  paid_on DATE NOT NULL,
  method VARCHAR(12) NOT NULL,
  reference VARCHAR(100) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bill_payments_bill FOREIGN KEY (bill_id) REFERENCES bills(id),
  CONSTRAINT fk_bill_payments_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_bill_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_bill_payments_method CHECK (method IN ('CASH', 'BANK', 'UPI', 'CHEQUE', 'OTHER')),
  KEY idx_bill_payments_paid_on (paid_on)
);

-- 4. Credit note: the bill's amount reduced after the goods left (return, damage, rate mistake), Super Admin only.
CREATE TABLE IF NOT EXISTS bill_credit_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  credit_number VARCHAR(30) NOT NULL,
  bill_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bill_credit_bill FOREIGN KEY (bill_id) REFERENCES bills(id),
  CONSTRAINT fk_bill_credit_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_bill_credit_amount CHECK (amount > 0),
  UNIQUE KEY uq_bill_credit_number (credit_number),
  KEY idx_bill_credit_created (created_at)
);

-- 5. What each purchased component cost: gives money spent on purchases and the cost of what was sold.
ALTER TABLE purchase_order_items ADD COLUMN rate DECIMAL(12,2) NULL AFTER quantity_ordered;

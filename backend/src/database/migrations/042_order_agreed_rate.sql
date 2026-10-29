-- The rate Marketing agreed with the customer for each product of the order (rate lock). The bill starts from it
-- instead of the price list, so a price list change after the order does not change what the customer was promised.
-- NULL: nothing agreed, the bill uses the price list. agreed_note: why the agreed rate is below the price list.
ALTER TABLE order_items
  ADD COLUMN agreed_rate DECIMAL(12,2) NULL AFTER quantity,
  ADD COLUMN agreed_note VARCHAR(255) NULL AFTER agreed_rate,
  ADD CONSTRAINT chk_order_item_agreed_rate CHECK (agreed_rate IS NULL OR agreed_rate >= 0);

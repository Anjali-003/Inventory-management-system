-- Add estimated delivery date to orders
ALTER TABLE orders
  ADD COLUMN estimated_delivery_date DATE NULL AFTER status;

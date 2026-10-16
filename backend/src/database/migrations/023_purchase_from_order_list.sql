-- Purchases can now ONLY be placed from the list the Operations Admin sent (order_purchase_items).
--
--   order_purchase_items.purchase_order_id   NULL  = still to be ordered (shows as "To order" for the Purchase Manager)
--                                            set   = already placed on that purchase order (can never be ordered twice)
--   purchase_orders.order_id                 the approved order this purchase was raised for
--                                            (NULL only for purchases that were entered by hand before this change)
--
-- The quantity of a purchase line is copied from order_purchase_items on the server; the Purchase Manager cannot
-- type a component or a quantity of their own.

ALTER TABLE order_purchase_items
  ADD COLUMN purchase_order_id INT NULL AFTER quantity,
  ADD CONSTRAINT fk_opu_purchase_order FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  ADD KEY idx_opu_purchase_order (purchase_order_id);

ALTER TABLE purchase_orders
  ADD COLUMN order_id INT NULL AFTER po_number,
  ADD CONSTRAINT fk_po_order FOREIGN KEY (order_id) REFERENCES orders(id),
  ADD KEY idx_po_order (order_id);

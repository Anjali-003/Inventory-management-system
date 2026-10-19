-- Support production and QC per product line while retaining one parent marketing order.
-- Legacy single-product production runs are safely linked to their only order item.
-- Ambiguous legacy multi-product runs remain unlinked rather than silently assigning historical quantities.

ALTER TABLE production_orders
  ADD COLUMN order_item_id INT NULL AFTER order_id;

UPDATE production_orders po
JOIN (
  SELECT order_id, MIN(id) AS order_item_id
  FROM order_items
  GROUP BY order_id
  HAVING COUNT(*) = 1
) single_item ON single_item.order_id = po.order_id
SET po.order_item_id = single_item.order_item_id
WHERE po.order_item_id IS NULL;

-- Add a replacement parent-order index before dropping its old unique index,
-- because that index also supports the production_orders -> orders foreign key.
ALTER TABLE production_orders
  ADD KEY idx_production_orders_order_id (order_id);

ALTER TABLE production_orders
  DROP INDEX order_id,
  ADD UNIQUE KEY uq_production_orders_order_item (order_item_id),
  ADD CONSTRAINT fk_production_orders_order_item
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;

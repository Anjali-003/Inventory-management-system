ALTER TABLE production_orders
ADD COLUMN quantity_to_produce INT NOT NULL DEFAULT 0,
ADD COLUMN quantity_completed INT NOT NULL DEFAULT 0;

UPDATE production_orders po
JOIN (
    SELECT
        order_id,
        MAX(quantity) AS ordered_quantity
    FROM order_items
    GROUP BY order_id
) oi
ON po.order_id = oi.order_id
SET
    po.quantity_to_produce = oi.ordered_quantity,
    po.quantity_completed =
        CASE
            WHEN po.status = 'COMPLETED'
            THEN oi.ordered_quantity
            ELSE 0
        END;
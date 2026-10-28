-- The date the customer asked for, kept apart from estimated_delivery_date (the date the Operations Admin can move).
ALTER TABLE orders
  ADD COLUMN required_by_date DATE NULL AFTER status;

-- Orders whose date was moved: the customer's date is the old date of the first change.
UPDATE orders o
  JOIN (
    SELECT n.order_id, JSON_UNQUOTE(JSON_EXTRACT(n.payload, '$.old_date')) AS d
    FROM notifications n
    JOIN (
      SELECT order_id, MIN(id) AS id FROM notifications
      WHERE type = 'DELIVERY_DATE_CHANGED' AND order_id IS NOT NULL GROUP BY order_id
    ) f ON f.id = n.id
  ) first ON first.order_id = o.id
  SET o.required_by_date = first.d
  WHERE first.d IS NOT NULL AND first.d <> 'null';

-- Every other order still has the date Marketing typed.
UPDATE orders o
  SET o.required_by_date = o.estimated_delivery_date
  WHERE o.required_by_date IS NULL
    AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.order_id = o.id AND n.type = 'DELIVERY_DATE_CHANGED');

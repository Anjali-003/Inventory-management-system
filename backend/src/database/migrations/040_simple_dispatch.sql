-- After QC only 4 steps are left:
--   QC pass -> HANDED_OVER (packed, sent to Store) -> IN_STORE (Store received) -> BILLED -> DELIVERED (Store gave it out)
-- The separate packing, Operations hand-over and "delivered" clicks are gone; move the records that sat at them.

UPDATE finished_goods
SET packed_at = COALESCE(packed_at, created_at), packed_by = COALESCE(packed_by, created_by),
    handed_over_at = COALESCE(handed_over_at, created_at), handed_over_by = COALESCE(handed_over_by, created_by),
    status = 'HANDED_OVER'
WHERE status IN ('PACKAGING', 'PACKED');

UPDATE orders o JOIN finished_goods fg ON fg.order_id = o.id
SET o.status = 'HANDED_OVER'
WHERE fg.status = 'HANDED_OVER' AND o.status IN ('PACKAGING', 'PACKED');

UPDATE finished_goods
SET delivered_at = COALESCE(delivered_at, dispatched_at), delivered_by = COALESCE(delivered_by, dispatched_by),
    status = 'DELIVERED'
WHERE status = 'DISPATCHED';

UPDATE orders o JOIN finished_goods fg ON fg.order_id = o.id
SET o.status = 'COMPLETED'
WHERE fg.status = 'DELIVERED' AND o.status <> 'COMPLETED';

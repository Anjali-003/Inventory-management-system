-- 1) Classify the rows production already wrote.
UPDATE inventory_transactions SET direction = 'OUT'     WHERE direction = 'NONE' AND transaction_type = 'CONSUMED';
UPDATE inventory_transactions SET direction = 'RESERVE' WHERE direction = 'NONE' AND transaction_type = 'RESERVED';
UPDATE inventory_transactions SET direction = 'RELEASE' WHERE direction = 'NONE' AND transaction_type = 'RELEASED';
UPDATE inventory_transactions
   SET reason = CONCAT('Production order #', reference_id)
 WHERE reason IS NULL AND reference_type = 'PRODUCTION_ORDER';

-- 2) Stock was seeded straight into `inventory` with no ledger entry, so the ledger could never
--    add up to the balance. Post one OPENING_BALANCE row per component for whatever is unexplained.
INSERT INTO inventory_transactions
  (component_id, transaction_type, direction, quantity, reason, created_by, created_at)
SELECT d.component_id,
       'OPENING_BALANCE',
       IF(d.diff > 0, 'IN', 'OUT'),
       ABS(d.diff),
       'Opening balance (existing stock before the ledger was enforced)',
       NULL,
       COALESCE(DATE_SUB(d.first_at, INTERVAL 1 SECOND), d.updated_at)
FROM (
  SELECT i.component_id,
         i.updated_at,
         f.first_at,
         i.quantity_on_hand - COALESCE(f.net, 0) AS diff
  FROM inventory i
  LEFT JOIN (
    SELECT component_id,
           MIN(created_at) AS first_at,
           SUM(CASE direction WHEN 'IN' THEN quantity WHEN 'OUT' THEN -quantity ELSE 0 END) AS net
    FROM inventory_transactions
    GROUP BY component_id
  ) f ON f.component_id = i.component_id
) d
WHERE d.diff <> 0;

-- 3) Running on-hand balance on every historic row.
UPDATE inventory_transactions t
JOIN (
  SELECT id,
         SUM(CASE direction WHEN 'IN' THEN quantity WHEN 'OUT' THEN -quantity ELSE 0 END)
           OVER (PARTITION BY component_id ORDER BY created_at, id) AS running
  FROM inventory_transactions
) r ON r.id = t.id
SET t.balance_after = r.running
WHERE t.balance_after IS NULL;

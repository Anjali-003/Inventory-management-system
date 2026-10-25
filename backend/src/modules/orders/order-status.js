/*
  One place that decides an order's status once production has started.

  An order can hold several products. Each product has its own production run (production_orders), testing/QC
  records and finished goods. For every product that has a target (see production-target.js) the order is:
      IN_PRODUCTION  while any product still has units to build (or has not been started yet)
      TESTING        all units built, but not every unit has been boxed as finished goods yet
      PACKAGING      everything boxed, some boxes not dispatched yet
      DISPATCHED     everything boxed and dispatched
  Once the order has its finished-goods record, finished-goods.service owns the status (PACKED ... COMPLETED)
  and this function leaves it alone.
*/
const { targetQuantitySql } = require("../production/production-target")

function statusFromRuns(runs) {
  const open = runs.filter((r) => r.target > 0)
  if (open.length === 0) return null
  if (open.some((r) => r.completed < r.target)) return "IN_PRODUCTION"
  if (open.some((r) => r.boxed < r.target)) return "TESTING"
  if (open.some((r) => r.shipped < r.target)) return "PACKAGING"
  return "DISPATCHED"
}

async function refreshOrderStatus(connection, orderId) {
  const [boxed] = await connection.query("SELECT id FROM finished_goods WHERE order_id = ? LIMIT 1", [orderId])
  if (boxed.length) return null

  const [rows] = await connection.query(
    `SELECT oi.product_id,
            ${targetQuantitySql("oi", "o")} AS target,
            COALESCE(po.quantity_completed, 0) AS completed,
            COALESCE((SELECT SUM(fg.quantity) FROM finished_goods fg WHERE fg.production_id = po.id), 0) AS boxed,
            COALESCE((SELECT SUM(fg.quantity) FROM finished_goods fg WHERE fg.production_id = po.id AND fg.status IN ('DISPATCHED', 'COMPLETED')), 0) AS shipped
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN production_orders po ON po.order_item_id = oi.id
     WHERE o.id = ?`,
    [orderId]
  )
  const status = statusFromRuns(
    rows.map((r) => ({
      target: Number(r.target),
      completed: Number(r.completed),
      boxed: Number(r.boxed),
      shipped: Number(r.shipped),
    }))
  )
  if (!status) return null
  await connection.query(
    `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'COMPLETED'`,
    [status, orderId]
  )
  return status
}

module.exports = { refreshOrderStatus, statusFromRuns }

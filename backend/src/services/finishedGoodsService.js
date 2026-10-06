const db = require("../config/db")

const selectSql = `
  SELECT fg.id, fg.production_id, fg.order_id, fg.quantity, fg.status,
         fg.created_at, fg.dispatched_at, fg.completed_at,
         o.order_number, oi.product_id, p.sku AS product_sku, p.name AS product_name
  FROM finished_goods fg
  JOIN orders o ON o.id = fg.order_id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
`

const mapRow = (r) => ({
  id: r.id, productionId: r.production_id, orderId: r.order_id, orderNumber: r.order_number,
  productId: r.product_id, productSku: r.product_sku, productName: r.product_name,
  quantity: Number(r.quantity), status: r.status, createdAt: r.created_at,
  dispatchedAt: r.dispatched_at, completedAt: r.completed_at,
})

async function getFinishedGoods() {
  const [rows] = await db.query(`${selectSql} ORDER BY fg.id DESC`)
  return rows.map(mapRow)
}

async function getFinishedGood(id) {
  const [rows] = await db.query(`${selectSql} WHERE fg.id = ? LIMIT 1`, [id])
  if (!rows.length) throw new Error("Finished goods record not found")
  return mapRow(rows[0])
}

async function createFinishedGood(productionId, orderId, quantity, connection = null) {
  const own = !connection
  connection ??= await db.getConnection()
  try {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Finished goods quantity must be a positive integer")
    const [production] = await connection.query(`SELECT id, order_id FROM production_orders WHERE id = ? LIMIT 1`, [productionId])
    if (!production.length) throw new Error("Production order not found")
    if (Number(production[0].order_id) !== Number(orderId)) throw new Error("Production order does not belong to the specified order")
    const [order] = await connection.query(`SELECT id FROM orders WHERE id = ? LIMIT 1`, [orderId])
    if (!order.length) throw new Error("Order not found")
    const [result] = await connection.query(`INSERT INTO finished_goods (production_id, order_id, quantity, status) VALUES (?, ?, ?, 'PACKAGING')`, [productionId, orderId, quantity])
    await connection.query(`UPDATE orders SET status = 'PACKAGING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`, [orderId])
    return { success: true, finishedGoodsId: result.insertId, productionId, orderId, quantity, status: "PACKAGING", message: "Finished goods created successfully" }
  } finally {
    if (own) connection.release()
  }
}

async function transition(id, from, to, timestampColumn) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(`SELECT id, order_id, status FROM finished_goods WHERE id = ? FOR UPDATE`, [id])
    if (!rows.length) throw new Error("Finished goods record not found")
    if (rows[0].status !== from) throw new Error(`Cannot ${to === "DISPATCHED" ? "dispatch" : "complete"} finished goods with status ${rows[0].status}`)
    await connection.query(`UPDATE finished_goods SET status = ?, ${timestampColumn} = CURRENT_TIMESTAMP WHERE id = ?`, [to, id])
    if (to === "DISPATCHED") {
      await connection.query(`UPDATE orders SET status = 'PACKAGING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [rows[0].order_id])
    } else {
      const [totals] = await connection.query(`
        SELECT COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = ?),0) AS ordered,
               COALESCE((SELECT SUM(quantity) FROM finished_goods WHERE order_id = ? AND status = 'COMPLETED'),0) AS completed
      `, [rows[0].order_id, rows[0].order_id])
      const status = Number(totals[0].completed) >= Number(totals[0].ordered) ? "COMPLETED" : "PACKAGING"
      await connection.query(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, rows[0].order_id])
    }
    await connection.commit()
    return { success: true, finishedGoodsId: id, status: to, message: `Finished goods marked as ${to.toLowerCase()} successfully` }
  } catch (error) {
    await connection.rollback(); throw error
  } finally {
    connection.release()
  }
}

const markDispatched = (id) => transition(id, "PACKAGING", "DISPATCHED", "dispatched_at")
const markCompleted = (id) => transition(id, "DISPATCHED", "COMPLETED", "completed_at")

module.exports = { getFinishedGoods, getFinishedGood, createFinishedGood, markDispatched, markCompleted }

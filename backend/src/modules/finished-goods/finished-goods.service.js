const db = require("../../config/db")
const AppError = require("../../shared/AppError")

const selectSql = `
  SELECT fg.id, fg.production_id, fg.order_id, fg.quantity, fg.status,
         fg.created_at, fg.dispatched_at, fg.completed_at,
         o.order_number, oi.product_id, p.sku AS product_sku, p.name AS product_name,
         cu.name AS created_by_name, du.name AS dispatched_by_name, xu.name AS completed_by_name
  FROM finished_goods fg
  JOIN orders o ON o.id = fg.order_id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  LEFT JOIN users cu ON cu.id = fg.created_by
  LEFT JOIN users du ON du.id = fg.dispatched_by
  LEFT JOIN users xu ON xu.id = fg.completed_by
`

const mapRow = (r) => ({
  id: r.id, productionId: r.production_id, orderId: r.order_id, orderNumber: r.order_number,
  productId: r.product_id, productSku: r.product_sku, productName: r.product_name,
  quantity: Number(r.quantity), status: r.status, createdAt: r.created_at,
  dispatchedAt: r.dispatched_at, completedAt: r.completed_at,
  createdByName: r.created_by_name, dispatchedByName: r.dispatched_by_name, completedByName: r.completed_by_name,
})

async function getFinishedGoods() {
  const [rows] = await db.query(`${selectSql} ORDER BY fg.id DESC`)
  return rows.map(mapRow)
}

async function getFinishedGood(id) {
  const [rows] = await db.query(`${selectSql} WHERE fg.id = ? LIMIT 1`, [id])
  if (!rows.length) throw new AppError(404, "Finished goods record not found")
  return mapRow(rows[0])
}

async function createFinishedGood(productionId, orderId, quantity, connection = null, userId = null) {
  const own = !connection
  connection ??= await db.getConnection()
  try {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new AppError(400, "Finished goods quantity must be a positive integer")
    const [production] = await connection.query(`
      SELECT po.id, po.order_id, po.quantity_completed, oi.quantity AS ordered_quantity
      FROM production_orders po
      JOIN order_items oi ON oi.order_id = po.order_id
      WHERE po.id = ?
      LIMIT 1
    `, [productionId])
    if (!production.length) throw new AppError(404, "Production order not found")
    if (Number(production[0].order_id) !== Number(orderId)) throw new AppError(400, "Production order does not belong to the specified order")

    const [order] = await connection.query(`SELECT id, status FROM orders WHERE id = ? LIMIT 1`, [orderId])
    if (!order.length) throw new AppError(404, "Order not found")

    const [testing] = await connection.query(`
      SELECT COALESCE(SUM(quantity_tested), 0) AS tested,
             COALESCE(SUM(quantity_failed), 0) AS failed
      FROM testing_records WHERE production_id = ?
    `, [productionId])

    const [qc] = await connection.query(`
      SELECT COALESCE(SUM(quantity_inspected), 0) AS inspected,
             COALESCE(SUM(quantity_approved), 0) AS approved
      FROM quality_control_records WHERE production_id = ?
    `, [productionId])

    const ordered = Number(production[0].ordered_quantity)
    if (Number(production[0].quantity_completed) < ordered) throw new AppError(409, "Finished goods can only be created after full production is completed")

    // New QC flow: an explicit batch PASS is the single release gate.
    // Older batches still pass through the original testing + QC checks below.
    const [decisions] = await connection.query(
      `SELECT decision FROM quality_control_batch_decisions
       WHERE production_id = ? ORDER BY attempt_number DESC LIMIT 1`,
      [productionId],
    )
    const batchDecision = decisions[0]?.decision || null
    if (batchDecision === "FAIL") throw new AppError(409, "A batch that failed Quality Control cannot enter Finished Goods")
    if (batchDecision !== "PASS") {
      if (Number(testing[0].tested) < ordered || Number(testing[0].failed) > 0) throw new AppError(409, "Finished goods require all units to pass testing")
      if (Number(qc[0].inspected) < ordered || Number(qc[0].approved) < ordered) throw new AppError(409, "Finished goods require full QC approval")
    }

    const [existing] = await connection.query(`SELECT id FROM finished_goods WHERE order_id = ? LIMIT 1`, [orderId])
    if (existing.length) return { success: true, finishedGoodsId: existing[0].id, productionId, orderId, quantity, status: "PACKAGING", message: "Finished goods already exist for this order" }

    const [result] = await connection.query(`INSERT INTO finished_goods (production_id, order_id, quantity, status, created_by) VALUES (?, ?, ?, 'PACKAGING', ?)`, [productionId, orderId, quantity, userId])
    await connection.query(`UPDATE orders SET status = 'PACKAGING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`, [orderId])
    return { success: true, finishedGoodsId: result.insertId, productionId, orderId, quantity, status: "PACKAGING", message: "Finished goods created successfully" }
  } finally {
    if (own) connection.release()
  }
}

async function transition(id, from, to, timestampColumn, userColumn, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(`SELECT id, order_id, status FROM finished_goods WHERE id = ? FOR UPDATE`, [id])
    if (!rows.length) throw new AppError(404, "Finished goods record not found")
    if (rows[0].status !== from) throw new AppError(409, `Cannot ${to === "DISPATCHED" ? "dispatch" : "complete"} finished goods with status ${rows[0].status}`)
    await connection.query(`UPDATE finished_goods SET status = ?, ${timestampColumn} = CURRENT_TIMESTAMP, ${userColumn} = ? WHERE id = ?`, [to, userId, id])
    if (to === "DISPATCHED") {
      await connection.query(`UPDATE orders SET status = 'DISPATCHED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [rows[0].order_id])
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

const markDispatched = (id, userId = null) => transition(id, "PACKAGING", "DISPATCHED", "dispatched_at", "dispatched_by", userId)
const markCompleted = (id, userId = null) => transition(id, "DISPATCHED", "COMPLETED", "completed_at", "completed_by", userId)

module.exports = { getFinishedGoods, getFinishedGood, createFinishedGood, markDispatched, markCompleted }

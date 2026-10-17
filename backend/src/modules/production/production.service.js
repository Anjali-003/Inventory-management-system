const db = require("../../config/db")
const AppError = require("../../shared/AppError")
const { refreshOrderStatus } = require("../orders/order-status")

/*
  Production is tracked per ORDER and PRODUCT: one production run (production_orders row) for each product of an
  order. A run's target is what the Operations Admin approved for that product (all approval passes added up), or the
  ordered quantity for older orders (see production-target.js).

  Production NEVER touches inventory. There is no reserve step and no consume step here: the components for every
  approved quantity are deducted once, directly, when the Operations Admin approves (order-approval.service.js,
  issueApprovedMaterials). Starting or completing a run only moves the run's counters and the order's status.

  Every function takes an optional productId. An order with ONE product does not need it; an order with several
  products must say which product it means.
*/

/* The order's product lines, one row per product (same product on two lines is added up). */
async function resolveLine(connection, orderId, productId) {
  const [rows] = await connection.query(`
    SELECT oi.product_id, SUM(oi.quantity) AS ordered_quantity, p.sku AS product_sku, p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    GROUP BY oi.product_id, p.sku, p.name
    ORDER BY MIN(oi.id)
  `, [orderId])

  if (!rows.length) throw new AppError(400, "Order has no products or BOM data")
  if (productId === undefined || productId === null) {
    if (rows.length > 1) throw new AppError(400, "This order has several products. Choose which product to produce.")
    return rows[0]
  }
  const line = rows.find((row) => Number(row.product_id) === Number(productId))
  if (!line) throw new AppError(404, "That product is not part of this order")
  return line
}

async function getProductionTarget(connection, orderId, productId, inventoryIssued) {
  const [rows] = await connection.query(`
    SELECT COALESCE(SUM(oi.quantity), 0) AS ordered_quantity,
           COALESCE((SELECT SUM(opi.quantity) FROM order_production_items opi WHERE opi.order_id = ? AND opi.product_id = ?), 0) AS approved_quantity
    FROM order_items oi
    WHERE oi.order_id = ? AND oi.product_id = ?
  `, [orderId, productId, orderId, productId])
  if (!rows.length || Number(rows[0].ordered_quantity) <= 0) throw new AppError(400, "Order has no products or BOM data")
  return {
    orderedQuantity: inventoryIssued ? Number(rows[0].approved_quantity) : Number(rows[0].ordered_quantity),
    approvedQuantity: Number(rows[0].approved_quantity),
  }
}

async function getProductionRun(connection, orderId, productId, { lock = false } = {}) {
  const [rows] = await connection.query(`
    SELECT id, status, quantity_to_produce, quantity_completed, started_at, completed_at
    FROM production_orders WHERE order_id = ? AND product_id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}
  `, [orderId, productId])
  return rows[0] || null
}

async function getProductionInfo(orderId, productId) {
  const connection = await db.getConnection()
  try {
    const [orders] = await connection.query(`SELECT id, order_number, status, inventory_issued_at FROM orders WHERE id = ?`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const order = orders[0]
    const issued = Boolean(order.inventory_issued_at)
    const line = await resolveLine(connection, orderId, productId)
    const target = await getProductionTarget(connection, orderId, line.product_id, issued)
    const run = await getProductionRun(connection, orderId, line.product_id)

    const orderedQuantity = target.orderedQuantity
    const quantityToProduce = Number(run?.quantity_to_produce || 0)
    const quantityCompleted = Number(run?.quantity_completed || 0)
    const quantityInProduction = Math.max(0, quantityToProduce - quantityCompleted)
    const remainingToStart = Math.max(0, orderedQuantity - quantityToProduce)
    const maxProductionQuantity = remainingToStart // stock was already deducted at approval: only the approved quantity limits it

    return {
      success: true, orderId: order.id, orderNumber: order.order_number, orderStatus: order.status,
      productId: line.product_id, productSku: line.product_sku, productName: line.product_name,
      orderedQuantity, quantityToProduce, quantityCompleted, quantityInProduction, remainingToStart,
      materialsIssued: true,
      maxProductionQuantity, productionId: run?.id || null, productionStatus: run?.status || "NOT_STARTED",
      startedAt: run?.started_at || null, completedAt: run?.completed_at || null,
    }
  } finally {
    connection.release()
  }
}

/* Kept for the existing endpoint. No stock check is needed any more (stock was deducted at approval); this only
   confirms the quantity fits inside what is still approved and not yet started. */
async function checkProductionMaterials(orderId, quantity, productId) {
  const connection = await db.getConnection()
  try {
    if (!Number.isInteger(orderId) || orderId <= 0) throw new AppError(400, "Invalid order ID")
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Quantity must be a positive integer")
    const [orders] = await connection.query(`SELECT id, order_number, status, inventory_issued_at FROM orders WHERE id = ?`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const issued = Boolean(orders[0].inventory_issued_at)
    const line = await resolveLine(connection, orderId, productId)
    const target = await getProductionTarget(connection, orderId, line.product_id, issued)
    const existing = await getProductionRun(connection, orderId, line.product_id)
    const remainingToStart = Math.max(0, target.orderedQuantity - Number(existing?.quantity_to_produce || 0))
    if (quantity > remainingToStart) throw new AppError(409, `Requested quantity exceeds remaining approved quantity. Remaining: ${remainingToStart}`)
    return {
      success: true, canProduce: true, orderId, orderNumber: orders[0].order_number, productId: line.product_id,
      requestedQuantity: quantity, remainingToStart, materials: [], shortages: [], status: "READY",
    }
  } finally {
    connection.release()
  }
}

// Statuses in which more units may still be started: a partly approved order can be approved again for the rest
// after its first units were already built, boxed or even dispatched.
const START_ALLOWED = ["PENDING", "IN_PRODUCTION", "TESTING", "PACKAGING", "DISPATCHED"]

/* Production may only start on an order Operations has approved (the controller checks this too). */
const APPROVED_FOR_PRODUCTION = ["APPROVED", "PARTIALLY_APPROVED"]
function assertApprovedForProduction(order) {
  if (!APPROVED_FOR_PRODUCTION.includes(order.approval_status)) {
    throw new AppError(409, "This order has not been approved for production yet")
  }
}

async function startProduction(orderId, quantity, userId, productId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query(`SELECT id, order_number, status, approval_status, inventory_issued_at FROM orders WHERE id = ? FOR UPDATE`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const order = orders[0]
    if (!START_ALLOWED.includes(order.status)) throw new AppError(409, `Order is currently ${order.status.toLowerCase().replace(/_/g, " ")}`)
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Production quantity must be a positive integer")

    const issued = Boolean(order.inventory_issued_at)
    assertApprovedForProduction(order)
    const line = await resolveLine(connection, orderId, productId)
    const target = await getProductionTarget(connection, orderId, line.product_id, issued)
    const ordered = target.orderedQuantity
    const existing = await getProductionRun(connection, orderId, line.product_id, { lock: true })
    const started = Number(existing?.quantity_to_produce || 0)
    const completed = Number(existing?.quantity_completed || 0)
    const remaining = Math.max(0, ordered - started)
    if (quantity > remaining) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remaining}`)

    let productionId = existing?.id
    if (existing) {
      await connection.query(`
        UPDATE production_orders
        SET quantity_to_produce = quantity_to_produce + ?, status = 'IN_PRODUCTION', completed_at = NULL, updated_by = ?
        WHERE id = ?
      `, [quantity, userId, productionId])
    } else {
      const [result] = await connection.query(`
        INSERT INTO production_orders (order_id, product_id, quantity_to_produce, quantity_completed, status, started_by, updated_by, started_at)
        VALUES (?, ?, ?, 0, 'IN_PRODUCTION', ?, ?, NOW())
      `, [orderId, line.product_id, quantity, userId, userId])
      productionId = result.insertId
    }

    await connection.query(`UPDATE orders SET status = 'IN_PRODUCTION' WHERE id = ?`, [orderId])
    await connection.commit()

    const totalStarted = started + quantity
    return {
      success: true, productionId, orderId: order.id, orderNumber: order.order_number, productId: line.product_id, productName: line.product_name,
      status: "IN_PRODUCTION", quantityStarted: quantity, totalStarted, quantityCompleted: completed, remainingToStart: ordered - totalStarted,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function getProductionOrders() {
  const [rows] = await db.query(`
    SELECT po.id, po.order_id, o.order_number, o.status AS order_status, po.status,
           po.product_id, p.sku AS product_sku, p.name AS product_name,
           po.quantity_to_produce, po.quantity_completed,
           (po.quantity_to_produce - po.quantity_completed) AS quantity_in_production,
           CASE WHEN o.inventory_issued_at IS NOT NULL THEN COALESCE(approved.quantity, 0) ELSE oi.ordered_quantity END AS ordered_quantity,
           po.started_at, po.completed_at,
           po.started_by, su.name AS started_by_name,
           po.updated_by, uu.name AS updated_by_name
    FROM production_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN products p ON p.id = po.product_id
    LEFT JOIN users su ON su.id = po.started_by
    LEFT JOIN users uu ON uu.id = po.updated_by
    JOIN (
      SELECT order_id, product_id, SUM(quantity) AS ordered_quantity FROM order_items GROUP BY order_id, product_id
    ) oi ON oi.order_id = po.order_id AND oi.product_id = po.product_id
    LEFT JOIN (
      SELECT order_id, product_id, SUM(quantity) AS quantity FROM order_production_items GROUP BY order_id, product_id
    ) approved ON approved.order_id = po.order_id AND approved.product_id = po.product_id
    ORDER BY po.id DESC
  `)
  return rows
}

async function updateProductionProgress(productionId, quantity, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Completed quantity must be a positive integer")
    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.product_id, po.status, po.quantity_to_produce, po.quantity_completed,
             o.order_number, o.inventory_issued_at
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      WHERE po.id = ? FOR UPDATE
    `, [productionId])
    if (!rows.length) throw new AppError(404, "Production order not found")
    const production = rows[0]
    if (production.status !== "IN_PRODUCTION") throw new AppError(409, "Production is not currently in progress")

    const issued = Boolean(production.inventory_issued_at)
    const target = await getProductionTarget(connection, production.order_id, production.product_id, issued)
    const orderedQuantity = target.orderedQuantity
    const started = Number(production.quantity_to_produce)
    const completed = Number(production.quantity_completed)
    const inProduction = Math.max(0, started - completed)
    if (quantity > inProduction) throw new AppError(409, `Cannot complete more than the currently started quantity. Currently in production: ${inProduction}`)

    const newCompleted = completed + quantity
    const runCompleted = newCompleted >= orderedQuantity
    await connection.query(`
      UPDATE production_orders SET quantity_completed = ?, status = ?, completed_at = ?, updated_by = ? WHERE id = ?
    `, [newCompleted, runCompleted ? "COMPLETED" : "IN_PRODUCTION", runCompleted ? new Date() : null, userId, productionId])
    // the order moves on (e.g. to TESTING) only when EVERY product of it has been built
    await refreshOrderStatus(connection, production.order_id)
    await connection.commit()

    return {
      success: true, productionId: production.id, orderId: production.order_id, orderNumber: production.order_number, productId: production.product_id,
      quantityCompleted: newCompleted, quantityStarted: started, quantityInProduction: Math.max(0, started - newCompleted),
      orderedQuantity, progressPercentage: orderedQuantity ? Math.min(100, Math.round(newCompleted / orderedQuantity * 100)) : 0,
      status: runCompleted ? "COMPLETED" : "IN_PRODUCTION",
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function completeProduction(productionId, userId) {
  const [rows] = await db.query(`SELECT quantity_to_produce, quantity_completed FROM production_orders WHERE id = ?`, [productionId])
  if (!rows.length) throw new AppError(404, "Production order not found")
  const remaining = Number(rows[0].quantity_to_produce) - Number(rows[0].quantity_completed)
  if (remaining <= 0) throw new AppError(409, "No products are currently waiting to be completed")
  return updateProductionProgress(productionId, remaining, userId)
}

module.exports = {
  startProduction,
  getProductionOrders,
  completeProduction,
  updateProductionProgress,
  getProductionInfo,
  checkProductionMaterials,
}

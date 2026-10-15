const db = require("../../config/db")
const AppError = require("../../shared/AppError")

async function getSingleOrderItem(connection, orderId) {
  const [rows] = await connection.query(`
    SELECT oi.product_id, oi.quantity AS ordered_quantity,
           p.sku AS product_sku, p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `, [orderId])

  if (!rows.length) throw new AppError(400, "Order has no products or BOM data")
  if (rows.length > 1) throw new AppError(400, "Partial production currently supports one product per order")
  return rows[0]
}

async function getRequiredMaterialsForQuantity(connection, orderId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Production quantity must be a positive integer")
  const item = await getSingleOrderItem(connection, orderId)
  const [rows] = await connection.query(`
    SELECT pb.component_id, c.sku AS component_sku, c.name AS component_name,
           c.unit, pb.quantity_required
    FROM product_bom pb
    JOIN components c ON c.id = pb.component_id
    WHERE pb.product_id = ?
    ORDER BY c.id
  `, [item.product_id])
  if (!rows.length) throw new AppError(400, "Order has no products or BOM data")

  const map = {}
  for (const row of rows) {
    const id = row.component_id
    const perUnit = Number(row.quantity_required)
    map[id] ??= { componentId: id, sku: row.component_sku, name: row.component_name, unit: row.unit, required: 0, requiredPerUnit: 0 }
    map[id].required += quantity * perUnit
    map[id].requiredPerUnit += perUnit
  }
  return Object.values(map)
}

async function calculateMaxProductionQuantity(connection, materials, remainingToStart) {
  if (remainingToStart <= 0) return 0
  let max = remainingToStart
  for (const material of materials) {
    const [rows] = await connection.query(`SELECT quantity_on_hand, quantity_reserved FROM inventory WHERE component_id = ?`, [material.componentId])
    if (!rows.length) return 0
    const available = Math.max(0, Number(rows[0].quantity_on_hand) - Number(rows[0].quantity_reserved))
    const perUnit = Number(material.requiredPerUnit)
    if (perUnit > 0) max = Math.min(max, Math.floor(available / perUnit))
    if (max <= 0) return 0
  }
  return max
}

async function getProductionInfo(orderId) {
  const connection = await db.getConnection()
  try {
    const [orders] = await connection.query(`SELECT id, order_number, status FROM orders WHERE id = ?`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const order = orders[0]
    const item = await getSingleOrderItem(connection, orderId)
    const [runs] = await connection.query(`
      SELECT id, status, quantity_to_produce, quantity_completed, started_at, completed_at
      FROM production_orders WHERE order_id = ? ORDER BY id DESC LIMIT 1
    `, [orderId])
    const run = runs[0] || null
    const orderedQuantity = Number(item.ordered_quantity)
    const quantityToProduce = Number(run?.quantity_to_produce || 0)
    const quantityCompleted = Number(run?.quantity_completed || 0)
    const quantityInProduction = Math.max(0, quantityToProduce - quantityCompleted)
    const remainingToStart = Math.max(0, orderedQuantity - quantityToProduce)
    const perUnit = await getRequiredMaterialsForQuantity(connection, orderId, 1)
    const maxProductionQuantity = await calculateMaxProductionQuantity(connection, perUnit, remainingToStart)

    return {
      success: true, orderId: order.id, orderNumber: order.order_number, orderStatus: order.status,
      productId: item.product_id, productSku: item.product_sku, productName: item.product_name,
      orderedQuantity, quantityToProduce, quantityCompleted, quantityInProduction, remainingToStart,
      maxProductionQuantity, productionId: run?.id || null, productionStatus: run?.status || "NOT_STARTED",
      startedAt: run?.started_at || null, completedAt: run?.completed_at || null,
    }
  } finally {
    connection.release()
  }
}

async function inspectMaterials(connection, orderId, quantity) {
  const materials = await getRequiredMaterialsForQuantity(connection, orderId, quantity)
  const shortages = []
  for (const material of materials) {
    const [rows] = await connection.query(`SELECT quantity_on_hand, quantity_reserved FROM inventory WHERE component_id = ?`, [material.componentId])
    const available = rows.length ? Math.max(0, Number(rows[0].quantity_on_hand) - Number(rows[0].quantity_reserved)) : 0
    material.available = available
    material.shortage = Math.max(0, material.required - available)
    material.status = material.shortage ? "INSUFFICIENT" : "SUFFICIENT"
    if (material.shortage) shortages.push(material)
  }
  return { materials, shortages }
}

async function getOrderProgress(connection, orderId) {
  const [rows] = await connection.query(`
    SELECT po.id, po.status, po.quantity_to_produce, po.quantity_completed,
           o.order_number, oi.quantity AS ordered_quantity
    FROM production_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE po.order_id = ? ORDER BY po.id DESC LIMIT 1
    FOR UPDATE
  `, [orderId])
  return rows[0] || null
}

async function checkProductionMaterials(orderId, quantity) {
  const connection = await db.getConnection()
  try {
    if (!Number.isInteger(orderId) || orderId <= 0) throw new AppError(400, "Invalid order ID")
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Quantity must be a positive integer")
    const [orders] = await connection.query(`SELECT id, order_number, status FROM orders WHERE id = ?`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const item = await getSingleOrderItem(connection, orderId)
    const existing = await getOrderProgress(connection, orderId)
    const remainingToStart = Math.max(0, Number(item.ordered_quantity) - Number(existing?.quantity_to_produce || 0))
    if (quantity > remainingToStart) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`)
    const checked = await inspectMaterials(connection, orderId, quantity)
    return {
      success: checked.shortages.length === 0,
      canProduce: checked.shortages.length === 0,
      orderId, orderNumber: orders[0].order_number, requestedQuantity: quantity,
      remainingToStart, materials: checked.materials, shortages: checked.shortages,
      status: checked.shortages.length ? "MATERIAL_SHORTAGE" : "READY",
    }
  } finally {
    connection.release()
  }
}

async function startProduction(orderId, quantity, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query(`SELECT id, order_number, status FROM orders WHERE id = ? FOR UPDATE`, [orderId])
    if (!orders.length) throw new AppError(404, "Order not found")
    const order = orders[0]
    if (!["PENDING", "IN_PRODUCTION", "TESTING"].includes(order.status)) throw new AppError(409, `Order is currently ${order.status.toLowerCase().replace(/_/g, " ")}`)
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Production quantity must be a positive integer")

    const item = await getSingleOrderItem(connection, orderId)
    const ordered = Number(item.ordered_quantity)
    const existing = await getOrderProgress(connection, orderId)
    const started = Number(existing?.quantity_to_produce || 0)
    const completed = Number(existing?.quantity_completed || 0)
    const remaining = Math.max(0, ordered - started)
    if (quantity > remaining) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remaining}`)

    const { materials, shortages } = await inspectMaterials(connection, orderId, quantity)
    if (shortages.length) {
      await connection.rollback()
      return { success: false, canProduce: false, status: "MATERIAL_SHORTAGE", shortages }
    }

    let productionId = existing?.id
    if (existing) {
      await connection.query(`
        UPDATE production_orders
        SET quantity_to_produce = quantity_to_produce + ?, status = 'IN_PRODUCTION', completed_at = NULL, updated_by = ?
        WHERE id = ?
      `, [quantity, userId, productionId])
    } else {
      const [result] = await connection.query(`
        INSERT INTO production_orders (order_id, quantity_to_produce, quantity_completed, status, started_by, updated_by, started_at)
        VALUES (?, ?, 0, 'IN_PRODUCTION', ?, ?, NOW())
      `, [orderId, quantity, userId, userId])
      productionId = result.insertId
    }

    for (const material of materials) {
      await connection.query(`UPDATE inventory SET quantity_reserved = quantity_reserved + ? WHERE component_id = ?`, [material.required, material.componentId])
      await connection.query(`
        INSERT INTO inventory_transactions
          (component_id, transaction_type, direction, quantity, balance_after, reason, reference_type, reference_id, created_by)
        VALUES (?, 'RESERVED', 'RESERVE', ?, (SELECT quantity_on_hand FROM inventory WHERE component_id = ?), ?, 'PRODUCTION_ORDER', ?, ?)
      `, [material.componentId, material.required, material.componentId, `Reserved for production order #${productionId}`, productionId, userId])
    }

    await connection.query(`UPDATE orders SET status = 'IN_PRODUCTION' WHERE id = ?`, [orderId])
    await connection.commit()

    const totalStarted = started + quantity
    return {
      success: true, productionId, orderId: order.id, orderNumber: order.order_number, status: "IN_PRODUCTION",
      quantityStarted: quantity, totalStarted, quantityCompleted: completed, remainingToStart: ordered - totalStarted,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function getProductionOrders() {
  const connection = await db.getConnection()
  try {
    // Include orders that have not started yet so the Production page can own the
    // complete workflow. The latest production run (when present) is joined once.
    const [rows] = await connection.query(`
      SELECT po.id, o.id AS order_id, o.order_number, o.status AS order_status,
             COALESCE(po.status, 'NOT_STARTED') AS status,
             COALESCE(po.quantity_to_produce, 0) AS quantity_to_produce,
             COALESCE(po.quantity_completed, 0) AS quantity_completed,
             GREATEST(COALESCE(po.quantity_to_produce, 0) - COALESCE(po.quantity_completed, 0), 0) AS quantity_in_production,
             oi.ordered_quantity, oi.product_name, oi.item_count,
             o.created_at AS order_created_at, po.started_at, po.completed_at,
             po.started_by, su.name AS started_by_name,
             po.updated_by, uu.name AS updated_by_name
      FROM orders o
      JOIN (
        SELECT oi.order_id, SUM(oi.quantity) AS ordered_quantity,
               MAX(p.name) AS product_name, COUNT(*) AS item_count
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        GROUP BY oi.order_id
      ) oi ON oi.order_id = o.id
      LEFT JOIN production_orders po ON po.id = (
        SELECT MAX(latest.id) FROM production_orders latest WHERE latest.order_id = o.id
      )
      LEFT JOIN users su ON su.id = po.started_by
      LEFT JOIN users uu ON uu.id = po.updated_by
      ORDER BY COALESCE(po.started_at, o.created_at) DESC, o.id DESC
    `)

    for (const row of rows) {
      const ordered = Number(row.ordered_quantity || 0)
      const started = Number(row.quantity_to_produce || 0)
      const completed = Number(row.quantity_completed || 0)
      const remainingToStart = Math.max(0, ordered - started)
      row.ordered_quantity = ordered
      row.quantity_to_produce = started
      row.quantity_completed = completed
      row.quantity_in_production = Math.max(0, started - completed)
      row.remaining_to_start = remainingToStart
      row.max_production_quantity = 0
      row.material_status = remainingToStart > 0 ? "UNKNOWN" : "NOT_REQUIRED"
      row.material_check_available = false

      // The existing partial-production workflow supports one product/BOM per order.
      // Compute how many additional units current unreserved stock can cover so the
      // page can show material readiness without opening a dialog for every row.
      if (remainingToStart > 0 && ["PENDING", "IN_PRODUCTION", "TESTING"].includes(row.order_status)) {
        try {
          const perUnitMaterials = await getRequiredMaterialsForQuantity(connection, Number(row.order_id), 1)
          const maxProductionQuantity = await calculateMaxProductionQuantity(connection, perUnitMaterials, remainingToStart)
          row.max_production_quantity = maxProductionQuantity
          row.material_status = maxProductionQuantity >= remainingToStart ? "COVERED" : "SHORTAGE"
          row.material_check_available = true
        } catch (error) {
          // One incomplete BOM should not prevent the rest of Production from loading.
          row.material_issue = error.message
        }
      }
    }

    return rows
  } finally {
    connection.release()
  }
}

async function updateProductionProgress(productionId, quantity, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Completed quantity must be a positive integer")
    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
             o.order_number, oi.quantity AS ordered_quantity
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE po.id = ? ORDER BY oi.id LIMIT 1 FOR UPDATE
    `, [productionId])
    if (!rows.length) throw new AppError(404, "Production order not found")
    const production = rows[0]
    if (production.status !== "IN_PRODUCTION") throw new AppError(409, "Production is not currently in progress")

    const orderedQuantity = Number(production.ordered_quantity)
    const started = Number(production.quantity_to_produce)
    const completed = Number(production.quantity_completed)
    const inProduction = Math.max(0, started - completed)
    if (quantity > inProduction) throw new AppError(409, `Cannot complete more than the currently started quantity. Currently in production: ${inProduction}`)

    const materials = await getRequiredMaterialsForQuantity(connection, production.order_id, quantity)
    for (const material of materials) {
      const [inventoryRows] = await connection.query(`SELECT quantity_on_hand, quantity_reserved FROM inventory WHERE component_id = ? FOR UPDATE`, [material.componentId])
      if (!inventoryRows.length) throw new AppError(409, `Inventory not found for ${material.name}`)
      const onHand = Number(inventoryRows[0].quantity_on_hand)
      const reserved = Number(inventoryRows[0].quantity_reserved)
      if (reserved < material.required) throw new AppError(409, `Reserved inventory is insufficient for ${material.name}`)
      if (onHand < material.required) throw new AppError(409, `On-hand inventory is insufficient for ${material.name}`)
      await connection.query(`UPDATE inventory SET quantity_on_hand = quantity_on_hand - ?, quantity_reserved = quantity_reserved - ? WHERE component_id = ?`, [material.required, material.required, material.componentId])
      await connection.query(`
        INSERT INTO inventory_transactions
          (component_id, transaction_type, direction, quantity, balance_after, reason, reference_type, reference_id, created_by)
        VALUES (?, 'CONSUMED', 'OUT', ?, (SELECT quantity_on_hand FROM inventory WHERE component_id = ?), ?, 'PRODUCTION_ORDER', ?, ?)
      `, [material.componentId, material.required, material.componentId, `Consumed by production order #${productionId}`, productionId, userId])
    }

    const newCompleted = completed + quantity
    const orderCompleted = newCompleted >= orderedQuantity
    await connection.query(`
      UPDATE production_orders SET quantity_completed = ?, status = ?, completed_at = ?, updated_by = ? WHERE id = ?
    `, [newCompleted, orderCompleted ? "COMPLETED" : "IN_PRODUCTION", orderCompleted ? new Date() : null, userId, productionId])
    await connection.query(`UPDATE orders SET status = ? WHERE id = ?`, [orderCompleted ? "TESTING" : "IN_PRODUCTION", production.order_id])
    await connection.commit()

    return {
      success: true, productionId: production.id, orderId: production.order_id, orderNumber: production.order_number,
      quantityCompleted: newCompleted, quantityStarted: started, quantityInProduction: Math.max(0, started - newCompleted),
      orderedQuantity, progressPercentage: orderedQuantity ? Math.min(100, Math.round(newCompleted / orderedQuantity * 100)) : 0,
      status: orderCompleted ? "COMPLETED" : "IN_PRODUCTION",
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

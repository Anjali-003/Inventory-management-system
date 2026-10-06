const db = require("../config/db")

async function getSingleOrderItem(connection, orderId) {
  const [rows] = await connection.query(`
    SELECT oi.product_id, oi.quantity AS ordered_quantity,
           p.sku AS product_sku, p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `, [orderId])

  if (!rows.length) throw new Error("Order has no products or BOM data")
  if (rows.length > 1) throw new Error("Partial production currently supports one product per order")
  return rows[0]
}

async function getRequiredMaterialsForQuantity(connection, orderId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Production quantity must be a positive integer")
  const item = await getSingleOrderItem(connection, orderId)
  const [rows] = await connection.query(`
    SELECT pb.component_id, c.sku AS component_sku, c.name AS component_name,
           c.unit, pb.quantity_required
    FROM product_bom pb
    JOIN components c ON c.id = pb.component_id
    WHERE pb.product_id = ?
    ORDER BY c.id
  `, [item.product_id])
  if (!rows.length) throw new Error("Order has no products or BOM data")

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
    if (!orders.length) throw new Error("Order not found")
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
    if (!Number.isInteger(orderId) || orderId <= 0) throw new Error("Invalid order ID")
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer")
    const [orders] = await connection.query(`SELECT id, order_number, status FROM orders WHERE id = ?`, [orderId])
    if (!orders.length) throw new Error("Order not found")
    const item = await getSingleOrderItem(connection, orderId)
    const existing = await getOrderProgress(connection, orderId)
    const remainingToStart = Math.max(0, Number(item.ordered_quantity) - Number(existing?.quantity_to_produce || 0))
    if (quantity > remainingToStart) throw new Error(`Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`)
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

async function startProduction(orderId, quantity, userId = 1) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query(`SELECT id, order_number, status FROM orders WHERE id = ? FOR UPDATE`, [orderId])
    if (!orders.length) throw new Error("Order not found")
    const order = orders[0]
    if (!["PENDING", "IN_PRODUCTION"].includes(order.status)) throw new Error(`Order is currently ${order.status.toLowerCase().replace(/_/g, " ")}`)
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Production quantity must be a positive integer")

    const item = await getSingleOrderItem(connection, orderId)
    const ordered = Number(item.ordered_quantity)
    const existing = await getOrderProgress(connection, orderId)
    const started = Number(existing?.quantity_to_produce || 0)
    const completed = Number(existing?.quantity_completed || 0)
    const remaining = Math.max(0, ordered - started)
    if (quantity > remaining) throw new Error(`Requested quantity exceeds remaining quantity to start. Remaining: ${remaining}`)

    const { materials, shortages } = await inspectMaterials(connection, orderId, quantity)
    if (shortages.length) {
      await connection.rollback()
      return { success: false, canProduce: false, status: "MATERIAL_SHORTAGE", shortages }
    }

    let productionId = existing?.id
    if (existing) {
      await connection.query(`
        UPDATE production_orders
        SET quantity_to_produce = quantity_to_produce + ?, status = 'IN_PRODUCTION', completed_at = NULL
        WHERE id = ?
      `, [quantity, productionId])
    } else {
      const [result] = await connection.query(`
        INSERT INTO production_orders (order_id, quantity_to_produce, quantity_completed, status, started_by, started_at)
        VALUES (?, ?, 0, 'IN_PRODUCTION', ?, NOW())
      `, [orderId, quantity, userId])
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
  const [rows] = await db.query(`
    SELECT po.id, po.order_id, o.order_number, o.status AS order_status, po.status,
           po.quantity_to_produce, po.quantity_completed,
           (po.quantity_to_produce - po.quantity_completed) AS quantity_in_production,
           oi.ordered_quantity, oi.product_name, po.started_at, po.completed_at
    FROM production_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN (
      SELECT oi.order_id, SUM(oi.quantity) AS ordered_quantity, MAX(p.name) AS product_name
      FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY oi.order_id
    ) oi ON oi.order_id = po.order_id
    ORDER BY po.id DESC
  `)
  return rows
}

async function updateProductionProgress(productionId, quantity, userId = 1) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Completed quantity must be a positive integer")
    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
             o.order_number, oi.quantity AS ordered_quantity
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE po.id = ? ORDER BY oi.id LIMIT 1 FOR UPDATE
    `, [productionId])
    if (!rows.length) throw new Error("Production order not found")
    const production = rows[0]
    if (production.status !== "IN_PRODUCTION") throw new Error("Production is not currently in progress")

    const orderedQuantity = Number(production.ordered_quantity)
    const started = Number(production.quantity_to_produce)
    const completed = Number(production.quantity_completed)
    const inProduction = Math.max(0, started - completed)
    if (quantity > inProduction) throw new Error(`Cannot complete more than the currently started quantity. Currently in production: ${inProduction}`)

    const materials = await getRequiredMaterialsForQuantity(connection, production.order_id, quantity)
    for (const material of materials) {
      const [inventoryRows] = await connection.query(`SELECT quantity_on_hand, quantity_reserved FROM inventory WHERE component_id = ? FOR UPDATE`, [material.componentId])
      if (!inventoryRows.length) throw new Error(`Inventory not found for ${material.name}`)
      const onHand = Number(inventoryRows[0].quantity_on_hand)
      const reserved = Number(inventoryRows[0].quantity_reserved)
      if (reserved < material.required) throw new Error(`Reserved inventory is insufficient for ${material.name}`)
      if (onHand < material.required) throw new Error(`On-hand inventory is insufficient for ${material.name}`)
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
      UPDATE production_orders SET quantity_completed = ?, status = ?, completed_at = ? WHERE id = ?
    `, [newCompleted, orderCompleted ? "COMPLETED" : "IN_PRODUCTION", orderCompleted ? new Date() : null, productionId])
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

async function completeProduction(productionId, userId = 1) {
  const [rows] = await db.query(`SELECT quantity_to_produce, quantity_completed FROM production_orders WHERE id = ?`, [productionId])
  if (!rows.length) throw new Error("Production order not found")
  const remaining = Number(rows[0].quantity_to_produce) - Number(rows[0].quantity_completed)
  if (remaining <= 0) throw new Error("No products are currently waiting to be completed")
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

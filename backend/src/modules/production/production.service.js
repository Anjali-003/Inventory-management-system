const db = require("../../config/db")
const AppError = require("../../shared/AppError")

async function getOrderItem(connection, orderItemId) {
  const [rows] = await connection.query(`
    SELECT oi.id AS order_item_id, oi.order_id, oi.product_id,
           oi.quantity AS ordered_quantity, o.order_number, o.status AS order_status,
           o.approval_status, p.sku AS product_sku, p.name AS product_name,
           (SELECT COUNT(*) FROM order_items siblings WHERE siblings.order_id = oi.order_id) AS item_count,
           (SELECT COUNT(*) FROM order_items previous WHERE previous.order_id = oi.order_id AND previous.id <= oi.id) AS item_index
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE oi.id = ?
    LIMIT 1
  `, [orderItemId])

  if (!rows.length) throw new AppError(404, "Order product was not found")
  return rows[0]
}

async function getRequiredMaterialsForQuantity(connection, orderItemId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Production quantity must be a positive integer")
  const item = await getOrderItem(connection, orderItemId)
  const [rows] = await connection.query(`
    SELECT pb.component_id, c.sku AS component_sku, c.name AS component_name,
           c.unit, pb.quantity_required
    FROM product_bom pb
    JOIN components c ON c.id = pb.component_id
    WHERE pb.product_id = ?
    ORDER BY c.id
  `, [item.product_id])
  if (!rows.length) throw new AppError(400, "This product has no BOM data")

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

async function getProductionInfo(orderItemId) {
  const connection = await db.getConnection()
  try {
    const item = await getOrderItem(connection, orderItemId)
    const [runs] = await connection.query(`
      SELECT id, status, quantity_to_produce, quantity_completed, started_at, completed_at
      FROM production_orders WHERE order_item_id = ? ORDER BY id DESC LIMIT 1
    `, [orderItemId])
    const run = runs[0] || null
    const orderedQuantity = Number(item.ordered_quantity)
    const quantityToProduce = Number(run?.quantity_to_produce || 0)
    const quantityCompleted = Number(run?.quantity_completed || 0)
    const quantityInProduction = Math.max(0, quantityToProduce - quantityCompleted)
    const remainingToStart = Math.max(0, orderedQuantity - quantityToProduce)
    const perUnit = await getRequiredMaterialsForQuantity(connection, orderItemId, 1)
    const maxProductionQuantity = await calculateMaxProductionQuantity(connection, perUnit, remainingToStart)

    return {
      success: true, orderId: Number(item.order_id), orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number, orderStatus: item.order_status,
      itemCount: Number(item.item_count), itemIndex: Number(item.item_index),
      productId: Number(item.product_id), productSku: item.product_sku, productName: item.product_name,
      orderedQuantity, quantityToProduce, quantityCompleted, quantityInProduction, remainingToStart,
      maxProductionQuantity, productionId: run?.id || null, productionStatus: run?.status || "NOT_STARTED",
      startedAt: run?.started_at || null, completedAt: run?.completed_at || null,
    }
  } finally {
    connection.release()
  }
}

async function inspectMaterials(connection, orderItemId, quantity) {
  const materials = await getRequiredMaterialsForQuantity(connection, orderItemId, quantity)
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

async function getOrderProgress(connection, orderItemId) {
  const [rows] = await connection.query(`
    SELECT po.id, po.order_id, po.order_item_id, po.status,
           po.quantity_to_produce, po.quantity_completed,
           o.order_number, oi.quantity AS ordered_quantity
    FROM production_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN order_items oi ON oi.id = po.order_item_id
    WHERE po.order_item_id = ?
    ORDER BY po.id DESC LIMIT 1 FOR UPDATE
  `, [orderItemId])
  return rows[0] || null
}

async function checkProductionMaterials(orderItemId, quantity) {
  const connection = await db.getConnection()
  try {
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new AppError(400, "Invalid order item ID")
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Quantity must be a positive integer")
    const item = await getOrderItem(connection, orderItemId)
    const existing = await getOrderProgress(connection, orderItemId)
    const remainingToStart = Math.max(0, Number(item.ordered_quantity) - Number(existing?.quantity_to_produce || 0))
    if (quantity > remainingToStart) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`)
    const checked = await inspectMaterials(connection, orderItemId, quantity)
    return {
      success: checked.shortages.length === 0,
      canProduce: checked.shortages.length === 0,
      orderId: Number(item.order_id), orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number, itemCount: Number(item.item_count), itemIndex: Number(item.item_index),
      productName: item.product_name, requestedQuantity: quantity,
      remainingToStart, materials: checked.materials, shortages: checked.shortages,
      status: checked.shortages.length ? "MATERIAL_SHORTAGE" : "READY",
    }
  } finally {
    connection.release()
  }
}

async function startProduction(orderItemId, quantity, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [items] = await connection.query(`
      SELECT oi.id AS order_item_id, oi.order_id, oi.product_id, oi.quantity AS ordered_quantity,
             o.order_number, o.status AS order_status, o.approval_status,
             (SELECT COUNT(*) FROM order_items siblings WHERE siblings.order_id = oi.order_id) AS item_count,
             (SELECT COUNT(*) FROM order_items previous WHERE previous.order_id = oi.order_id AND previous.id <= oi.id) AS item_index
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ? FOR UPDATE
    `, [orderItemId])
    if (!items.length) throw new AppError(404, "Order product was not found")
    const item = items[0]
    if (item.approval_status && item.approval_status !== "APPROVED") {
      const message = item.approval_status === "REJECTED"
        ? "This order was rejected by the Operations Admin, so production cannot start."
        : item.approval_status === "DRAFT"
          ? "This order is still a draft with the Marketing Manager. It has not been sent for approval yet."
          : "This order is waiting for Operations Admin approval. Production can start once it is approved."
      throw new AppError(409, message)
    }
    if (!["PENDING", "IN_PRODUCTION", "TESTING"].includes(item.order_status)) {
      throw new AppError(409, `Order is currently ${String(item.order_status || "unknown").toLowerCase().replace(/_/g, " ")}`)
    }
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Production quantity must be a positive integer")

    const ordered = Number(item.ordered_quantity)
    const existing = await getOrderProgress(connection, orderItemId)
    const started = Number(existing?.quantity_to_produce || 0)
    const completed = Number(existing?.quantity_completed || 0)
    const remaining = Math.max(0, ordered - started)
    if (quantity > remaining) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remaining}`)

    const { materials, shortages } = await inspectMaterials(connection, orderItemId, quantity)
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
        INSERT INTO production_orders (order_id, order_item_id, quantity_to_produce, quantity_completed, status, started_by, updated_by, started_at)
        VALUES (?, ?, ?, 0, 'IN_PRODUCTION', ?, ?, NOW())
      `, [item.order_id, orderItemId, quantity, userId, userId])
      productionId = result.insertId
    }

    for (const material of materials) {
      await connection.query(`UPDATE inventory SET quantity_reserved = quantity_reserved + ? WHERE component_id = ?`, [material.required, material.componentId])
      await connection.query(`
        INSERT INTO inventory_transactions
          (component_id, transaction_type, direction, quantity, balance_after, reason, reference_type, reference_id, created_by)
        VALUES (?, 'RESERVED', 'RESERVE', ?, (SELECT quantity_on_hand FROM inventory WHERE component_id = ?), ?, 'PRODUCTION_ORDER', ?, ?)
      `, [material.componentId, material.required, material.componentId, `Reserved for production batch #${productionId}`, productionId, userId])
    }

    await connection.query(`UPDATE orders SET status = 'IN_PRODUCTION' WHERE id = ? AND status NOT IN ('PACKAGING', 'DISPATCHED', 'COMPLETED')`, [item.order_id])
    await connection.commit()

    const totalStarted = started + quantity
    return {
      success: true, productionId, orderId: Number(item.order_id), orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number, itemCount: Number(item.item_count), itemIndex: Number(item.item_index), status: "IN_PRODUCTION",
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
    // One row represents one product line within the parent marketing order.
    // Production/QC history stays attached to that line's production batch.
    const [rows] = await connection.query(`
      SELECT po.id, oi.id AS order_item_id, o.id AS order_id, o.order_number,
             o.status AS order_status, oi.quantity AS ordered_quantity,
             p.name AS product_name, p.sku AS product_sku,
             (SELECT COUNT(*) FROM order_items siblings WHERE siblings.order_id = o.id) AS item_count,
             (SELECT COUNT(*) FROM order_items previous WHERE previous.order_id = o.id AND previous.id <= oi.id) AS item_index,
             COALESCE(po.status, 'NOT_STARTED') AS status,
             COALESCE(po.quantity_to_produce, 0) AS quantity_to_produce,
             COALESCE(po.quantity_completed, 0) AS quantity_completed,
             GREATEST(COALESCE(po.quantity_to_produce, 0) - COALESCE(po.quantity_completed, 0), 0) AS quantity_in_production,
             o.created_at AS order_created_at, po.started_at, po.completed_at,
             po.started_by, su.name AS started_by_name,
             po.updated_by, uu.name AS updated_by_name,
             qbd.decision AS qc_decision, qbd.attempt_number AS qc_attempt_number,
             qbd.remarks AS qc_remarks, qbd.decided_at AS qc_decided_at,
             qc_user.name AS qc_decided_by_name,
             rc.id AS rework_id, rc.failed_attempt_number AS rework_attempt_number,
             rc.status AS rework_status, rc.rework_remarks,
             rc.started_at AS rework_started_at, rc.submitted_at AS rework_submitted_at,
             rework_start_user.name AS rework_started_by_name,
             rework_submit_user.name AS rework_submitted_by_name
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN production_orders po ON po.order_item_id = oi.id
      LEFT JOIN users su ON su.id = po.started_by
      LEFT JOIN users uu ON uu.id = po.updated_by
      LEFT JOIN quality_control_batch_decisions qbd ON qbd.id = (
        SELECT d.id FROM quality_control_batch_decisions d
        WHERE d.production_id = po.id
        ORDER BY d.attempt_number DESC LIMIT 1
      )
      LEFT JOIN users qc_user ON qc_user.id = qbd.decided_by
      LEFT JOIN quality_control_rework_cycles rc ON rc.id = (
        SELECT r.id FROM quality_control_rework_cycles r
        WHERE r.production_id = po.id
        ORDER BY r.failed_attempt_number DESC LIMIT 1
      )
      LEFT JOIN users rework_start_user ON rework_start_user.id = rc.started_by
      LEFT JOIN users rework_submit_user ON rework_submit_user.id = rc.submitted_by
      ORDER BY COALESCE(po.started_at, o.created_at) DESC, o.id DESC, oi.id ASC
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

      if (remainingToStart > 0 && ["PENDING", "IN_PRODUCTION", "TESTING"].includes(row.order_status)) {
        try {
          const perUnitMaterials = await getRequiredMaterialsForQuantity(connection, Number(row.order_item_id), 1)
          const maxProductionQuantity = await calculateMaxProductionQuantity(connection, perUnitMaterials, remainingToStart)
          row.max_production_quantity = maxProductionQuantity
          row.material_status = maxProductionQuantity >= remainingToStart ? "COVERED" : "SHORTAGE"
          row.material_check_available = true
        } catch (error) {
          // A product with an incomplete BOM should not prevent other orders from loading.
          row.material_issue = error.message
        }
      }
    }

    return rows
  } finally {
    connection.release()
  }
}

async function syncParentOrderProductionStatus(connection, orderId) {
  const [rows] = await connection.query(`
    SELECT COUNT(*) AS item_count,
           SUM(CASE WHEN po.id IS NOT NULL AND po.quantity_completed >= oi.quantity THEN 1 ELSE 0 END) AS completed_items,
           SUM(CASE WHEN COALESCE(po.quantity_to_produce, 0) > 0 THEN 1 ELSE 0 END) AS started_items
    FROM order_items oi
    LEFT JOIN production_orders po ON po.order_item_id = oi.id
    WHERE oi.order_id = ?
  `, [orderId])
  const itemCount = Number(rows[0]?.item_count || 0)
  const completedItems = Number(rows[0]?.completed_items || 0)
  const startedItems = Number(rows[0]?.started_items || 0)
  const nextStatus = itemCount > 0 && completedItems === itemCount
    ? "TESTING"
    : startedItems > 0 ? "IN_PRODUCTION" : "PENDING"
  await connection.query(`
    UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status NOT IN ('PACKAGING', 'DISPATCHED', 'COMPLETED')
  `, [nextStatus, orderId])
  return nextStatus
}

async function updateProductionProgress(productionId, quantity, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Completed quantity must be a positive integer")
    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.order_item_id, po.status,
             po.quantity_to_produce, po.quantity_completed,
             o.order_number, oi.quantity AS ordered_quantity,
             p.name AS product_name
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.id = po.order_item_id
      JOIN products p ON p.id = oi.product_id
      WHERE po.id = ? LIMIT 1 FOR UPDATE
    `, [productionId])
    if (!rows.length) throw new AppError(404, "Production order not found")
    const production = rows[0]
    if (production.status !== "IN_PRODUCTION") throw new AppError(409, "Production is not currently in progress")

    const orderedQuantity = Number(production.ordered_quantity)
    const started = Number(production.quantity_to_produce)
    const completed = Number(production.quantity_completed)
    const inProduction = Math.max(0, started - completed)
    if (quantity > inProduction) throw new AppError(409, `Cannot complete more than the currently started quantity. Currently in production: ${inProduction}`)

    const materials = await getRequiredMaterialsForQuantity(connection, production.order_item_id, quantity)
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
      `, [material.componentId, material.required, material.componentId, `Consumed by production batch #${productionId}`, productionId, userId])
    }

    const newCompleted = completed + quantity
    const itemCompleted = newCompleted >= orderedQuantity
    await connection.query(`
      UPDATE production_orders SET quantity_completed = ?, status = ?, completed_at = ?, updated_by = ? WHERE id = ?
    `, [newCompleted, itemCompleted ? "COMPLETED" : "IN_PRODUCTION", itemCompleted ? new Date() : null, userId, productionId])
    const parentStatus = await syncParentOrderProductionStatus(connection, production.order_id)
    await connection.commit()

    return {
      success: true, productionId: production.id, orderId: production.order_id,
      orderItemId: production.order_item_id, orderNumber: production.order_number,
      quantityCompleted: newCompleted, quantityStarted: started, quantityInProduction: Math.max(0, started - newCompleted),
      orderedQuantity, progressPercentage: orderedQuantity ? Math.min(100, Math.round(newCompleted / orderedQuantity * 100)) : 0,
      status: itemCompleted ? "COMPLETED" : "IN_PRODUCTION", orderStatus: parentStatus,
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


async function getLatestReworkCycle(connection, productionId) {
  const [rows] = await connection.query(
    `SELECT * FROM quality_control_rework_cycles
     WHERE production_id = ?
     ORDER BY failed_attempt_number DESC LIMIT 1 FOR UPDATE`,
    [productionId],
  )
  return rows[0] || null
}

async function assertLatestDecisionFailed(connection, productionId, cycle) {
  const [rows] = await connection.query(
    `SELECT decision, attempt_number FROM quality_control_batch_decisions
     WHERE production_id = ?
     ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE`,
    [productionId],
  )
  const latest = rows[0]
  if (!latest || latest.decision !== "FAIL" || Number(latest.attempt_number) !== Number(cycle.failed_attempt_number)) {
    throw new AppError(409, "Only the latest QC-failed attempt can be reworked")
  }
}

async function startQualityControlRework(productionId, userId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [locked] = await connection.query(
      "SELECT id FROM production_orders WHERE id = ? FOR UPDATE",
      [productionId],
    )
    if (!locked.length) throw new AppError(404, "Production batch not found")

    const cycle = await getLatestReworkCycle(connection, productionId)
    if (!cycle) throw new AppError(409, "This batch has no QC failure requiring rework")
    await assertLatestDecisionFailed(connection, productionId, cycle)
    if (cycle.status !== "NEEDS_REWORK") {
      throw new AppError(409, cycle.status === "IN_PROGRESS"
        ? "Rework has already been started for this batch"
        : "This rework task is no longer available to start")
    }

    await connection.query(
      `UPDATE quality_control_rework_cycles
       SET status = 'IN_PROGRESS', started_by = ?, started_at = CURRENT_TIMESTAMP,
           submitted_by = NULL, submitted_at = NULL, rework_remarks = NULL
       WHERE id = ?`,
      [userId || null, cycle.id],
    )
    await connection.commit()
    return {
      success: true,
      productionId,
      reworkId: cycle.id,
      status: "IN_PROGRESS",
      message: "Rework started. Fix the issue, then submit the batch to QC.",
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function submitQualityControlRework(productionId, remarks, userId) {
  const cleanRemarks = String(remarks || "").trim()
  if (!cleanRemarks) throw new AppError(400, "Enter the rework performed before submitting to QC")
  if (cleanRemarks.length > 2000) throw new AppError(400, "Rework notes must be 2,000 characters or fewer")

  const connection = await db.getConnection()
  let transactionStarted = false
  try {
    await connection.beginTransaction()
    transactionStarted = true

    // Lock and read only the production fields needed for the full-completion check.
    // Avoid joining product details here; rework submission does not need them.
    const [productionRows] = await connection.query(
      `SELECT id, order_id, order_item_id, quantity_completed
       FROM production_orders
       WHERE id = ?
       LIMIT 1 FOR UPDATE`,
      [productionId],
    )
    const production = productionRows[0]
    if (!production) throw new AppError(404, "Production batch not found")

    const [quantityRows] = await connection.query(
      `SELECT quantity AS ordered_quantity
       FROM order_items
       WHERE id = ? LIMIT 1`,
      [production.order_item_id],
    )
    const orderedQuantity = Number(quantityRows[0]?.ordered_quantity || 0)
    const completedQuantity = Number(production.quantity_completed || 0)
    if (orderedQuantity <= 0 || completedQuantity < orderedQuantity) {
      throw new AppError(409, "The full production batch must be complete before QC rework can be resubmitted")
    }

    const cycle = await getLatestReworkCycle(connection, productionId)
    if (!cycle) throw new AppError(409, "This batch has no QC rework task")
    await assertLatestDecisionFailed(connection, productionId, cycle)
    if (cycle.status !== "IN_PROGRESS") {
      throw new AppError(409, "Start rework before submitting the batch to QC")
    }

    const [updateResult] = await connection.query(
      `UPDATE quality_control_rework_cycles
       SET status = 'READY_FOR_QC', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP,
           rework_remarks = ?
       WHERE id = ? AND production_id = ? AND status = 'IN_PROGRESS'`,
      [userId || null, cleanRemarks, cycle.id, productionId],
    )
    if (!updateResult.affectedRows) {
      throw new AppError(409, "The rework task changed before it could be submitted. Refresh and try again.")
    }

    await connection.commit()
    transactionStarted = false
    return {
      success: true,
      productionId,
      reworkId: cycle.id,
      status: "READY_FOR_QC",
      message: "Rework recorded. The batch is back in the Quality Control queue for retesting.",
    }
  } catch (error) {
    if (transactionStarted) {
      try { await connection.rollback() } catch (rollbackError) {
        console.error("Failed to roll back QC rework submission", rollbackError)
      }
    }
    // The central async handler provides the client-safe message; log DB details for diagnosis.
    if (!(error instanceof AppError)) {
      console.error("[submitQualityControlRework]", {
        productionId,
        code: error.code,
        sqlMessage: error.sqlMessage,
        message: error.message,
      })
    }
    throw error
  } finally {
    connection.release()
  }
}

module.exports = {
  startProduction,
  getProductionOrders,
  completeProduction,
  updateProductionProgress,
  getProductionInfo,
  checkProductionMaterials,
  startQualityControlRework,
  submitQualityControlRework,
}

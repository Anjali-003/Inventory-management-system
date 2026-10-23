const db = require("../../config/db")
const AppError = require("../../shared/AppError")
const materialRequests = require("../material-requests/material-request.service")

async function getOrderItem(connection, orderItemId) {
  const [rows] = await connection.query(`
    SELECT oi.id AS order_item_id, oi.order_id, oi.product_id,
           oi.quantity AS ordered_quantity, o.order_number, o.status AS order_status,
           o.approval_status, o.inventory_issued_at, p.sku AS product_sku, p.name AS product_name,
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

/*
 * Production target is the order-line quantity, not the quantity that could be
 * made from stock on hand during approval. order_production_items is the
 * approval-time stock-feasibility plan; shortages can be purchased later and
 * supplied through the Store material-request workflow.
 */
async function getProductionTargetForItem(_connection, item) {
  return Math.max(0, Number(item.ordered_quantity || 0))
}

// Inventory is deducted by Operations approval. Store allotment records physical handover only.
// Production itself only tracks material readiness, production quantities, and status; it does not reserve or consume stock.

async function getOrderProgress(connection, orderItemId) {
  const [rows] = await connection.query(`
    SELECT po.id, po.order_id, po.order_item_id, po.status,
           po.quantity_to_produce, po.quantity_completed,
           o.order_number, oi.quantity AS ordered_quantity
    FROM production_orders po
    JOIN orders o ON o.id = po.order_id
    JOIN order_items oi ON oi.id = po.order_item_id
    WHERE po.order_item_id = ?
    ORDER BY po.id DESC
    LIMIT 1 FOR UPDATE
  `, [orderItemId]);

  return rows[0] || null;
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
    const orderedQuantity = await getProductionTargetForItem(connection, item)
    const quantityToProduce = Number(run?.quantity_to_produce || 0)
    const quantityCompleted = Number(run?.quantity_completed || 0)
    const quantityInProduction = Math.max(0, quantityToProduce - quantityCompleted)
    const remainingToStart = Math.max(0, orderedQuantity - quantityToProduce)
    const materialState = await materialRequests.getItemMaterialState(connection, orderItemId, orderedQuantity, quantityToProduce)
    const maxProductionQuantity = Math.min(remainingToStart, Number(materialState.maxStartQuantity || 0))

    return {
      success: true, orderId: Number(item.order_id), orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number, orderStatus: item.order_status,
      itemCount: Number(item.item_count), itemIndex: Number(item.item_index),
      productId: Number(item.product_id), productSku: item.product_sku, productName: item.product_name,
      orderedQuantity, quantityToProduce, quantityCompleted, quantityInProduction, remainingToStart,
      materialsIssued: maxProductionQuantity > 0,
      materialStatus: materialState.status,
      maxProductionQuantity, productionId: run?.id || null, productionStatus: run?.status || "NOT_STARTED",
      startedAt: run?.started_at || null, completedAt: run?.completed_at || null,
    }
  } finally {
    connection.release()
  }
}

async function checkProductionMaterials(orderItemId, quantity) {
  const connection = await db.getConnection()
  try {
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) throw new AppError(400, "Invalid order item ID")
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(400, "Quantity must be a positive integer")
    const item = await getOrderItem(connection, orderItemId)
    const targetQuantity = await getProductionTargetForItem(connection, item)
    const existing = await getOrderProgress(connection, orderItemId)
    const started = Number(existing?.quantity_to_produce || 0)
    const remainingToStart = Math.max(0, targetQuantity - started)
    if (quantity > remainingToStart) throw new AppError(409, `Requested quantity exceeds remaining quantity to start. Remaining: ${remainingToStart}`)
    const state = await materialRequests.getItemMaterialState(connection, orderItemId, targetQuantity, started)
    const materials = state.components.map((component) => {
      const required = Number(component.quantity_per_unit || 0) * quantity
      const alreadyStartedRequirement = Number(component.quantity_per_unit || 0) * started
      const available = Math.max(0, Number(component.issued_quantity || 0) - alreadyStartedRequirement)
      return { componentId: component.component_id, name: component.name, required, available, shortage: Math.max(0, required - available) }
    })
    const shortages = materials.filter((component) => component.shortage > 0)
    const canProduce = state.bomComplete && quantity <= Number(state.maxStartQuantity || 0)
    return {
      success: true, canProduce,
      orderId: Number(item.order_id), orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number, itemCount: Number(item.item_count), itemIndex: Number(item.item_index),
      productName: item.product_name, requestedQuantity: quantity,
      orderedQuantity: Number(item.ordered_quantity), approvedProductionQuantity: targetQuantity,
      remainingToStart, materials, shortages,
      status: canProduce ? "READY" : state.status,
      message: canProduce ? "Store-issued materials cover this quantity." : "Request the required materials and wait for Store to issue them before starting production.",
    }
  } finally {
    connection.release()
  }
}

async function startProduction(orderItemId, quantity, userId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [items] = await connection.query(`
      SELECT oi.id AS order_item_id, oi.order_id, oi.product_id,
             oi.quantity AS ordered_quantity,
             o.order_number, o.status AS order_status, o.approval_status,
             o.inventory_issued_at,
             (SELECT COUNT(*) FROM order_items siblings
              WHERE siblings.order_id = oi.order_id) AS item_count,
             (SELECT COUNT(*) FROM order_items previous
              WHERE previous.order_id = oi.order_id AND previous.id <= oi.id) AS item_index
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ?
      LIMIT 1 FOR UPDATE
    `, [orderItemId]);

    if (!items.length) throw new AppError(404, "Order product was not found");

    const item = items[0];

    if (item.approval_status && item.approval_status !== "APPROVED") {
      const message = item.approval_status === "REJECTED"
        ? "This order was rejected by the Operations Admin, so production cannot start."
        : item.approval_status === "DRAFT"
          ? "This order is still a draft with the Marketing Manager. It has not been sent for approval yet."
          : "This order is waiting for Operations Admin approval. Production can start once it is approved.";

      throw new AppError(409, message);
    }

    if (!["PENDING", "IN_PRODUCTION", "TESTING"].includes(item.order_status)) {
      throw new AppError(
        409,
        `Order is currently ${String(item.order_status || "unknown").toLowerCase().replace(/_/g, " ")}`
      );
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, "Production quantity must be a positive integer");
    }

    const ordered = await getProductionTargetForItem(connection, item);
    const existing = await getOrderProgress(connection, orderItemId);
    const started = Number(existing?.quantity_to_produce || 0);
    const completed = Number(existing?.quantity_completed || 0);
    const remaining = Math.max(0, ordered - started);

    if (quantity > remaining) {
      throw new AppError(
        409,
        `Requested quantity exceeds remaining quantity to start. Remaining: ${remaining}`
      );
    }

    const materialState = await materialRequests.getItemMaterialState(connection, orderItemId, ordered, started);
    const maxStartable = Math.min(remaining, Number(materialState.maxStartQuantity || 0));
    if (!materialState.bomComplete || quantity > maxStartable) {
      throw AppError.conflict(
        `Store has issued materials for only ${maxStartable} additional unit(s). Request materials from the Store Manager before starting production.`,
        "MATERIALS_NOT_ISSUED",
        { max_production_quantity: maxStartable }
      );
    }

    let productionId = existing?.id || null;

    if (existing) {
      await connection.query(`
        UPDATE production_orders
        SET quantity_to_produce = quantity_to_produce + ?,
            status = 'IN_PRODUCTION',
            completed_at = NULL,
            updated_by = ?
        WHERE id = ?
      `, [quantity, userId, productionId]);
    } else {
      const [result] = await connection.query(`
        INSERT INTO production_orders
          (order_id, order_item_id, quantity_to_produce, quantity_completed,
           status, started_by, updated_by, started_at)
        VALUES (?, ?, ?, 0, 'IN_PRODUCTION', ?, ?, NOW())
      `, [item.order_id, orderItemId, quantity, userId, userId]);

      productionId = result.insertId;
    }

    // Inventory deductions are handled by Operations approval. Starting production only updates production counters.

    await connection.query(`
      UPDATE orders
      SET status = 'IN_PRODUCTION',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status NOT IN ('PACKAGING', 'DISPATCHED', 'COMPLETED')
    `, [item.order_id]);

    await connection.commit();

    const totalStarted = started + quantity;

    return {
      success: true,
      productionId,
      orderId: Number(item.order_id),
      orderItemId: Number(item.order_item_id),
      orderNumber: item.order_number,
      itemCount: Number(item.item_count),
      itemIndex: Number(item.item_index),
      status: "IN_PRODUCTION",
      quantityStarted: quantity,
      totalStarted,
      quantityCompleted: completed,
      remainingToStart: ordered - totalStarted,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // Preserve the original production error.
    }
    throw error;
  } finally {
    connection.release();
  }
}
async function getProductionOrders() {
  const connection = await db.getConnection()
  try {
    // One row represents one product line within the parent marketing order.
    // Production/QC history stays attached to that line's production batch.
    const [rows] = await connection.query(`
      SELECT po.id, oi.id AS order_item_id, oi.product_id, o.id AS order_id, o.order_number,
             o.status AS order_status, o.approval_status, oi.quantity AS ordered_quantity,
             o.inventory_issued_at,
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
      const lineOrderedQuantity = Math.max(0, Number(row.ordered_quantity || 0))
      // Approval-time stock planning does not reduce the customer order target.
      // Any material shortage can be requested from Store after replenishment.
      const targetQuantity = lineOrderedQuantity
      const started = Number(row.quantity_to_produce || 0)
      const completed = Number(row.quantity_completed || 0)
      const remainingToStart = Math.max(0, targetQuantity - started)
      row.order_item_quantity = lineOrderedQuantity
      row.ordered_quantity = targetQuantity
      row.approved_production_quantity = targetQuantity
      row.quantity_to_produce = started
      row.quantity_completed = completed
      row.quantity_in_production = Math.max(0, started - completed)
      row.remaining_to_start = remainingToStart
      // Retain the response fields expected by the current frontend, but do not
      // inspect inventory because materials were deducted at approval.
      row.target_quantity = targetQuantity
    }

    const materialStates = await materialRequests.getMaterialStatesForItems(connection, rows.map((row) => ({
      order_item_id: Number(row.order_item_id),
      order_id: Number(row.order_id),
      product_id: Number(row.product_id),
      approval_status: row.approval_status,
      inventory_issued_at: row.inventory_issued_at,
      target_quantity: Number(row.target_quantity || 0),
      quantity_started: Number(row.quantity_to_produce || 0),
    })))

    for (const row of rows) {
      const state = materialStates.get(Number(row.order_item_id))
      row.max_production_quantity = state ? state.maxStartQuantity : 0
      row.material_status = state ? state.status : "UNKNOWN"
      row.material_requestable_quantity = state ? state.materialRequestableQuantity : 0
      row.requestable_product_quantity = state ? state.requestableProductQuantity : 0
      row.requested_product_quantity = state ? state.requestedProductQuantity : 0
      row.issued_product_quantity = state ? state.issuedProductQuantity : 0
      row.material_request_outstanding_product_quantity = state ? state.materialRequestOutstandingProductQuantity : 0
      row.material_request_outstanding_quantity = state ? state.materialRequestOutstandingQuantity : 0
      // Allotted units are the units covered by Store handovers, including units
      // already started. This uses material-request issue records, never on-hand inventory.
      row.material_allotted_quantity = Math.min(
        Number(row.ordered_quantity || 0),
        Number(row.quantity_to_produce || 0) + Number(row.max_production_quantity || 0),
      )
      row.material_left_to_allot = Math.max(0, Number(row.ordered_quantity || 0) - row.material_allotted_quantity)
      // Kept for compatibility with older consumers; this is not an inventory availability check.
      row.material_check_available = true
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
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, "Completed quantity must be a positive integer");
    }

    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.order_item_id, po.status,
             po.quantity_to_produce, po.quantity_completed,
             o.order_number, oi.quantity AS ordered_quantity,
             o.inventory_issued_at,
             p.name AS product_name
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.id = po.order_item_id
      JOIN products p ON p.id = oi.product_id
      WHERE po.id = ?
      LIMIT 1 FOR UPDATE
    `, [productionId]);

    if (!rows.length) throw new AppError(404, "Production order not found");

    const production = rows[0];

    if (production.status !== "IN_PRODUCTION") {
      throw new AppError(409, "Production is not currently in progress");
    }

    const productionItem = {
      order_item_id: production.order_item_id,
      order_id: production.order_id,
      product_id: null,
      ordered_quantity: production.ordered_quantity,
      inventory_issued_at: production.inventory_issued_at,
    };
    const [itemRows] = await connection.query(`
      SELECT oi.id AS order_item_id, oi.order_id, oi.product_id,
             oi.quantity AS ordered_quantity, o.inventory_issued_at
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ? LIMIT 1
    `, [production.order_item_id]);
    if (!itemRows.length) throw new AppError(404, "Order product was not found");
    Object.assign(productionItem, itemRows[0]);
    const orderedQuantity = await getProductionTargetForItem(connection, productionItem);
    const started = Number(production.quantity_to_produce);
    const completed = Number(production.quantity_completed);
    const inProduction = Math.max(0, started - completed);

    if (quantity > inProduction) {
      throw new AppError(
        409,
        `Cannot complete more than the currently started quantity. Currently in production: ${inProduction}`
      );
    }

    // Do not consume inventory here: Operations approval already deducted the materials.

    const newCompleted = completed + quantity;
    const itemCompleted = newCompleted >= orderedQuantity;

    await connection.query(`
      UPDATE production_orders
      SET quantity_completed = ?,
          status = ?,
          completed_at = ?,
          updated_by = ?
      WHERE id = ?
    `, [
      newCompleted,
      itemCompleted ? "COMPLETED" : "IN_PRODUCTION",
      itemCompleted ? new Date() : null,
      userId,
      productionId,
    ]);

    const parentStatus = await syncParentOrderProductionStatus(
      connection,
      production.order_id
    );

    await connection.commit();

    return {
      success: true,
      productionId: production.id,
      orderId: production.order_id,
      orderItemId: production.order_item_id,
      orderNumber: production.order_number,
      quantityCompleted: newCompleted,
      quantityStarted: started,
      quantityInProduction: Math.max(0, started - newCompleted),
      orderedQuantity,
      progressPercentage: orderedQuantity
        ? Math.min(100, Math.round((newCompleted / orderedQuantity) * 100))
        : 0,
      status: itemCompleted ? "COMPLETED" : "IN_PRODUCTION",
      orderStatus: parentStatus,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // Preserve the original production error.
    }
    throw error;
  } finally {
    connection.release();
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
      `SELECT id, order_id, order_item_id, quantity_to_produce, quantity_completed
       FROM production_orders
       WHERE id = ?
       LIMIT 1 FOR UPDATE`,
      [productionId],
    )
    const production = productionRows[0]
    if (!production) throw new AppError(404, "Production batch not found")

    const batchQuantity = Number(production.quantity_to_produce || 0)
    const completedQuantity = Number(production.quantity_completed || 0)
    if (batchQuantity <= 0 || completedQuantity < batchQuantity) {
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
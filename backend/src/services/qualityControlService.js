const db = require("../config/db")
const { createFinishedGood } = require("./finishedGoodsService")

const productionQuery = `
  SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
         o.order_number, oi.product_id, oi.quantity AS ordered_quantity,
         p.sku AS product_sku, p.name AS product_name
  FROM production_orders po
  JOIN orders o ON o.id = po.order_id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  WHERE po.id = ? ORDER BY oi.id LIMIT 1
`

async function getProductionOrder(connection, productionId) {
  const [rows] = await connection.query(productionQuery, [productionId])
  if (!rows.length) throw new Error("Production order not found")
  return rows[0]
}

async function getTestingSummary(connection, productionId) {
  const production = await getProductionOrder(connection, productionId)
  const [rows] = await connection.query(`
    SELECT COALESCE(SUM(quantity_tested),0) AS quantity_tested,
           COALESCE(SUM(quantity_passed),0) AS quantity_passed,
           COALESCE(SUM(quantity_failed),0) AS quantity_failed
    FROM testing_records WHERE production_id = ?
  `, [productionId])

  const tested = Number(rows[0].quantity_tested)

  return {
    produced: Number(production.quantity_completed),
    quantityTested: tested,
    quantityPassed: Number(rows[0].quantity_passed),
    quantityFailed: Number(rows[0].quantity_failed),
    remainingToTest: Math.max(0, Number(production.quantity_completed) - tested),
  }
}

async function getQualityControlSummary(connection, productionId) {
  const [rows] = await connection.query(`
    SELECT COALESCE(SUM(quantity_inspected),0) AS quantity_inspected,
           COALESCE(SUM(quantity_approved),0) AS quantity_approved,
           COALESCE(SUM(quantity_rejected),0) AS quantity_rejected
    FROM quality_control_records WHERE production_id = ?
  `, [productionId])

  const testing = await getTestingSummary(connection, productionId)
  const inspected = Number(rows[0].quantity_inspected)

  return {
    quantityInspected: inspected,
    quantityApproved: Number(rows[0].quantity_approved),
    quantityRejected: Number(rows[0].quantity_rejected),
    availableForQC: Math.max(0, testing.quantityPassed - inspected),
  }
}

async function latest(connection, table, productionId) {
  const [rows] = await connection.query(
    `SELECT * FROM ${table} WHERE production_id = ? ORDER BY id DESC LIMIT 1`,
    [productionId]
  )
  return rows[0] || null
}

async function getQualityControlInfo(productionId) {
  const connection = await db.getConnection()

  try {
    const production = await getProductionOrder(connection, productionId)
    const testing = await getTestingSummary(connection, productionId)
    const qualityControl = await getQualityControlSummary(connection, productionId)

    return {
      success: true,
      production: {
        id: production.id,
        orderId: production.order_id,
        orderNumber: production.order_number,
        productId: production.product_id,
        productSku: production.product_sku,
        productName: production.product_name,
        orderedQuantity: Number(production.ordered_quantity),
        quantityCompleted: Number(production.quantity_completed),
        status: production.status,
      },
      testing,
      qualityControl,
      latestTesting: await latest(connection, "testing_records", productionId),
      latestQualityControl: await latest(connection, "quality_control_records", productionId),
    }
  } finally {
    connection.release()
  }
}

async function saveTestingResult(productionId, quantity, overallResult, remarks, userId = 1) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const production = await getProductionOrder(connection, productionId)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Testing quantity must be a positive integer")
    }

    if (!["PASS", "FAIL"].includes(overallResult)) {
      throw new Error("Overall testing result must be PASS or FAIL")
    }

    const summary = await getTestingSummary(connection, productionId)

    if (quantity > summary.remainingToTest) {
      throw new Error(
        `Cannot test more than the remaining untested quantity. Remaining: ${summary.remainingToTest}`
      )
    }

    const passed = overallResult === "PASS" ? quantity : 0
    const failed = overallResult === "FAIL" ? quantity : 0

    const [result] = await connection.query(`
      INSERT INTO testing_records
        (production_id, quantity_tested, quantity_passed, quantity_failed, overall_result, remarks, tested_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [production.id, quantity, passed, failed, overallResult, remarks || null, userId])

    const testing = await getTestingSummary(connection, productionId)
    const qualityControl = await getQualityControlSummary(connection, productionId)
    const finish = await finishOrderIfReady(connection, production, testing, qualityControl)

    await connection.commit()

    return {
      success: true,
      testingId: result.insertId,
      productionId,
      quantityTested: quantity,
      quantityPassed: passed,
      quantityFailed: failed,
      overallResult,
      readyForFinishedGoods: !!finish?.readyForFinishedGoods,
      finishedGoodsId: finish?.finishedGoodsId || null,
      message: "Testing result saved successfully"
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function redoTesting(productionId, redoPassed, userId = 1) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    await getProductionOrder(connection, productionId)

    if (!Number.isInteger(redoPassed) || redoPassed < 0) {
      throw new Error("Redo passed quantity must be a non-negative integer")
    }

    const [rows] = await connection.query(`
      SELECT id, quantity_tested, quantity_passed, quantity_failed
      FROM testing_records
      WHERE production_id = ? AND quantity_failed > 0
      ORDER BY id DESC
      FOR UPDATE
    `, [productionId])

    const totalFailed = rows.reduce(
      (sum, row) => sum + Number(row.quantity_failed),
      0
    )

    if (redoPassed > totalFailed) {
      throw new Error(
        `Redo passed quantity cannot exceed total failed quantity. Failed: ${totalFailed}`
      )
    }

    let remainingRedo = redoPassed

    for (const row of rows) {
      if (remainingRedo <= 0) break

      const currentFailed = Number(row.quantity_failed)
      const currentPassed = Number(row.quantity_passed)
      const moved = Math.min(remainingRedo, currentFailed)
      const quantityFailed = currentFailed - moved
      const quantityPassed = currentPassed + moved
      const overallResult = quantityFailed === 0 ? "PASS" : "FAIL"

      await connection.query(`
        UPDATE testing_records
        SET quantity_passed = ?,
            quantity_failed = ?,
            overall_result = ?,
            tested_by = ?
        WHERE id = ?
      `, [quantityPassed, quantityFailed, overallResult, userId, row.id])

      remainingRedo -= moved
    }

    const summary = await getTestingSummary(connection, productionId)
    const qualityControl = await getQualityControlSummary(connection, productionId)
    const finish = await finishOrderIfReady(connection, await getProductionOrder(connection, productionId), summary, qualityControl)

    await connection.commit()

    return {
      success: true,
      productionId,
      quantityTested: summary.quantityTested,
      quantityPassed: summary.quantityPassed,
      quantityFailed: summary.quantityFailed,
      overallResult: summary.quantityFailed === 0 ? "PASS" : "FAIL",
      readyForFinishedGoods: !!finish?.readyForFinishedGoods,
      finishedGoodsId: finish?.finishedGoodsId || null,
      message:
        summary.quantityFailed === 0
          ? "All failed units fixed. Testing now passes."
          : "Redo testing result saved successfully"
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function finishOrderIfReady(connection, production, testing, qualityControl) {
  const ordered = Number(production.ordered_quantity)
  const ready =
    Number(production.quantity_completed) >= ordered &&
    Number(testing.remainingToTest) === 0 &&
    Number(testing.quantityFailed) === 0 &&
    Number(qualityControl.quantityInspected) >= ordered &&
    Number(qualityControl.quantityApproved) >= ordered &&
    Number(qualityControl.quantityRejected) === 0

  if (!ready) {
    const status = Number(production.quantity_completed) < ordered ? "IN_PRODUCTION" : "TESTING"
    await connection.query(
      `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`,
      [status, production.order_id]
    )
    return null
  }

  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM finished_goods WHERE order_id = ?`,
    [production.order_id]
  )
  const existing = Number(rows[0].quantity)
  const missing = Math.max(0, ordered - existing)

  let finishedGoods = null
  if (missing > 0) {
    finishedGoods = await createFinishedGood(production.id, production.order_id, missing, connection)
  } else {
    await connection.query(
      `UPDATE orders SET status = 'PACKAGING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`,
      [production.order_id]
    )
  }

  return { readyForFinishedGoods: true, finishedGoodsId: finishedGoods?.finishedGoodsId || null }
}

async function redoQualityControl(productionId, redoApproved, userId = 1) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const production = await getProductionOrder(connection, productionId)

    if (!Number.isInteger(redoApproved) || redoApproved < 0) {
      throw new Error("Redo approved quantity must be a non-negative integer")
    }

    const [rows] = await connection.query(`
      SELECT id, quantity_approved, quantity_rejected
      FROM quality_control_records
      WHERE production_id = ? AND quantity_rejected > 0
      ORDER BY id DESC
      FOR UPDATE
    `, [productionId])

    const totalRejected = rows.reduce((sum, row) => sum + Number(row.quantity_rejected), 0)

    if (redoApproved > totalRejected) {
      throw new Error(`Redo approved quantity cannot exceed total rejected quantity. Rejected: ${totalRejected}`)
    }

    let remainingRedo = redoApproved

    for (const row of rows) {
      if (remainingRedo <= 0) break

      const rejected = Number(row.quantity_rejected)
      const approved = Number(row.quantity_approved)
      const moved = Math.min(remainingRedo, rejected)
      const nextRejected = rejected - moved
      const nextApproved = approved + moved
      const overallResult = nextRejected === 0 ? "PASS" : "FAIL"

      await connection.query(`
        UPDATE quality_control_records
        SET quantity_approved = ?, quantity_rejected = ?, overall_result = ?, checked_by = ?
        WHERE id = ?
      `, [nextApproved, nextRejected, overallResult, userId, row.id])

      remainingRedo -= moved
    }

    const qualityControl = await getQualityControlSummary(connection, productionId)
    const testing = await getTestingSummary(connection, productionId)
    const finish = await finishOrderIfReady(connection, production, testing, qualityControl)

    await connection.commit()

    return {
      success: true,
      productionId,
      quantityInspected: qualityControl.quantityInspected,
      quantityApproved: qualityControl.quantityApproved,
      quantityRejected: qualityControl.quantityRejected,
      overallResult: qualityControl.quantityRejected === 0 ? "PASS" : "FAIL",
      readyForFinishedGoods: !!finish?.readyForFinishedGoods,
      finishedGoodsId: finish?.finishedGoodsId || null,
      message: qualityControl.quantityRejected === 0
        ? "All rejected units fixed. QC now passes."
        : "QC edit result saved successfully"
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function saveQualityControlResult(productionId, quantity, overallResult, remarks, userId = 1) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const production = await getProductionOrder(connection, productionId)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("QC quantity must be a positive integer")
    }

    if (!["PASS", "FAIL"].includes(overallResult)) {
      throw new Error("Overall QC result must be PASS or FAIL")
    }

    const summary = await getQualityControlSummary(connection, productionId)

    if (quantity > summary.availableForQC) {
      throw new Error(
        `Cannot inspect more than the quantity available for QC. Available: ${summary.availableForQC}`
      )
    }

    const approved = overallResult === "PASS" ? quantity : 0
    const rejected = overallResult === "FAIL" ? quantity : 0

    const [result] = await connection.query(`
      INSERT INTO quality_control_records
        (production_id, quantity_inspected, quantity_approved, quantity_rejected, overall_result, remarks, checked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [production.id, quantity, approved, rejected, overallResult, remarks || null, userId])

    const testing = await getTestingSummary(connection, productionId)
    const qualityControl = await getQualityControlSummary(connection, productionId)
    const finish = await finishOrderIfReady(connection, production, testing, qualityControl)

    await connection.commit()

    return {
      success: true,
      qualityControlId: result.insertId,
      productionId,
      quantityInspected: quantity,
      quantityApproved: approved,
      quantityRejected: rejected,
      overallResult,
      readyForFinishedGoods: !!finish?.readyForFinishedGoods,
      finishedGoodsId: finish?.finishedGoodsId || null,
      message: finish?.readyForFinishedGoods
        ? "QC complete and finished goods created successfully"
        : "Quality control result saved successfully",
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function getQualityControlOrders() {
  const connection = await db.getConnection()

  try {
    const [rows] = await connection.query(`
      SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
             po.started_at, po.completed_at, o.order_number, oi.quantity AS ordered_quantity,
             p.name AS product_name, p.sku AS product_sku,
             COALESCE((SELECT SUM(t.quantity_tested) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_tested,
             COALESCE((SELECT SUM(t.quantity_passed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_passed,
             COALESCE((SELECT SUM(t.quantity_failed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_failed,
             COALESCE((SELECT SUM(q.quantity_inspected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_inspected,
             COALESCE((SELECT SUM(q.quantity_approved) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_approved,
             COALESCE((SELECT SUM(q.quantity_rejected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_rejected
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE po.quantity_completed > 0
      ORDER BY po.id DESC
    `)

    return rows.map((row) => {
      const ordered = Number(row.ordered_quantity)
      const completed = Number(row.quantity_completed)
      const tested = Number(row.quantity_tested)
      const passed = Number(row.quantity_passed)
      const failed = Number(row.quantity_failed)
      const inspected = Number(row.quantity_inspected)
      const approved = Number(row.quantity_approved)
      const rejected = Number(row.quantity_rejected)
      const remainingToTest = Math.max(0, completed - tested)
      const availableForQC = Math.max(0, passed - inspected)
      const readyForFinishedGoods =
        completed >= ordered &&
        remainingToTest === 0 &&
        failed === 0 &&
        inspected >= ordered &&
        approved >= ordered &&
        rejected === 0

      return {
        id: row.id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        productName: row.product_name,
        productSku: row.product_sku,
        orderedQuantity: ordered,
        quantityCompleted: completed,
        quantityTested: tested,
        quantityPassed: passed,
        quantityFailed: failed,
        remainingToTest,
        quantityInspected: inspected,
        quantityApproved: approved,
        quantityRejected: rejected,
        availableForQC,
        readyForFinishedGoods,
        status: readyForFinishedGoods ? "PACKAGING" : completed < ordered ? "IN_PRODUCTION" : "TESTING",
        startedAt: row.started_at,
        completedAt: row.completed_at,
      }
    })
  } finally {
    connection.release()
  }
}

module.exports = {
  getQualityControlOrders,
  getQualityControlInfo,
  saveTestingResult,
  redoTesting,
  redoQualityControl,
  saveQualityControlResult
}

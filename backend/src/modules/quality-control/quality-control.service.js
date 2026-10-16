const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const { createFinishedGood } = require("../finished-goods/finished-goods.service");

const productionQuery = `
  SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
         o.order_number, o.status AS order_status, oi.product_id, oi.quantity AS ordered_quantity,
         p.sku AS product_sku, p.name AS product_name
  FROM production_orders po
  JOIN orders o ON o.id = po.order_id
  JOIN order_items oi ON oi.order_id = o.id
  JOIN products p ON p.id = oi.product_id
  WHERE po.id = ? ORDER BY oi.id LIMIT 1
`;

async function getProductionOrder(connection, productionId) {
  const [rows] = await connection.query(productionQuery, [productionId]);
  if (!rows.length) throw new AppError(404, "Production order not found");
  return rows[0];
}

async function getTestingSummary(connection, productionId) {
  const production = await getProductionOrder(connection, productionId);
  const [rows] = await connection.query(
    `
    SELECT COALESCE(SUM(quantity_tested),0) AS quantity_tested,
           COALESCE(SUM(quantity_passed),0) AS quantity_passed,
           COALESCE(SUM(quantity_failed),0) AS quantity_failed
    FROM testing_records WHERE production_id = ?
  `,
    [productionId],
  );

  const tested = Number(rows[0].quantity_tested);

  return {
    produced: Number(production.quantity_completed),
    quantityTested: tested,
    quantityPassed: Number(rows[0].quantity_passed),
    quantityFailed: Number(rows[0].quantity_failed),
    remainingToTest: Math.max(
      0,
      Number(production.quantity_completed) - tested,
    ),
  };
}

async function getQualityControlSummary(connection, productionId) {
  const [rows] = await connection.query(
    `
    SELECT COALESCE(SUM(quantity_inspected),0) AS quantity_inspected,
           COALESCE(SUM(quantity_approved),0) AS quantity_approved,
           COALESCE(SUM(quantity_rejected),0) AS quantity_rejected
    FROM quality_control_records WHERE production_id = ?
  `,
    [productionId],
  );

  const testing = await getTestingSummary(connection, productionId);
  const inspected = Number(rows[0].quantity_inspected);

  return {
    quantityInspected: inspected,
    quantityApproved: Number(rows[0].quantity_approved),
    quantityRejected: Number(rows[0].quantity_rejected),
    availableForQC: Math.max(0, testing.quantityPassed - inspected),
  };
}

async function latest(connection, table, productionId) {
  // user_name = who recorded (or last edited) that row
  const userColumn = table === "testing_records" ? "tested_by" : "checked_by";
  const [rows] = await connection.query(
    `SELECT r.*, u.name AS user_name
     FROM ${table} r
     LEFT JOIN users u ON u.id = r.${userColumn}
     WHERE r.production_id = ? ORDER BY r.id DESC LIMIT 1`,
    [productionId],
  );
  return rows[0] || null;
}

async function getQualityControlInfo(productionId) {
  const connection = await db.getConnection();

  try {
    const production = await getProductionOrder(connection, productionId);
    const testing = await getTestingSummary(connection, productionId);
    const qualityControl = await getQualityControlSummary(
      connection,
      productionId,
    );

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
        status: production.order_status || production.status,
      },
      testing,
      qualityControl,
      latestTesting: await latest(connection, "testing_records", productionId),
      latestQualityControl: await latest(
        connection,
        "quality_control_records",
        productionId,
      ),
    };
  } finally {
    connection.release();
  }
}

async function saveTestingResult(
  productionId,
  quantity,
  overallResult,
  remarks,
  userId,
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const production = await getProductionOrder(connection, productionId);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, "Testing quantity must be a positive integer");
    }

    if (!["PASS", "FAIL"].includes(overallResult)) {
      throw new AppError(400, "Overall testing result must be PASS or FAIL");
    }

    const summary = await getTestingSummary(connection, productionId);

    if (quantity > summary.remainingToTest) {
      throw new AppError(409,
        `Cannot test more than the remaining untested quantity. Remaining: ${summary.remainingToTest}`,
      );
    }

    const passed = overallResult === "PASS" ? quantity : 0;
    const failed = overallResult === "FAIL" ? quantity : 0;

    const [result] = await connection.query(
      `
      INSERT INTO testing_records
        (production_id, quantity_tested, quantity_passed, quantity_failed, overall_result, remarks, tested_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        production.id,
        quantity,
        passed,
        failed,
        overallResult,
        remarks || null,
        userId,
      ],
    );

    const testing = await getTestingSummary(connection, productionId);
    const qualityControl = await getQualityControlSummary(
      connection,
      productionId,
    );
    const finish = await finishOrderIfReady(
      connection,
      production,
      testing,
      qualityControl,
      userId,
    );

    await connection.commit();

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
      message: "Testing result saved successfully",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function redoTesting(productionId, redoPassed, userId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await getProductionOrder(connection, productionId);

    if (!Number.isInteger(redoPassed) || redoPassed < 0) {
      throw new AppError(400, "Redo passed quantity must be a non-negative integer");
    }

    const [rows] = await connection.query(
      `
      SELECT id, quantity_tested, quantity_passed, quantity_failed
      FROM testing_records
      WHERE production_id = ? AND quantity_failed > 0
      ORDER BY id DESC
      FOR UPDATE
    `,
      [productionId],
    );

    const totalFailed = rows.reduce(
      (sum, row) => sum + Number(row.quantity_failed),
      0,
    );

    if (redoPassed > totalFailed) {
      throw new AppError(400,
        `Redo passed quantity cannot exceed total failed quantity. Failed: ${totalFailed}`,
      );
    }

    let remainingRedo = redoPassed;

    for (const row of rows) {
      if (remainingRedo <= 0) break;

      const currentFailed = Number(row.quantity_failed);
      const currentPassed = Number(row.quantity_passed);
      const moved = Math.min(remainingRedo, currentFailed);
      const quantityFailed = currentFailed - moved;
      const quantityPassed = currentPassed + moved;
      const overallResult = quantityFailed === 0 ? "PASS" : "FAIL";

      await connection.query(
        `
        UPDATE testing_records
        SET quantity_passed = ?,
            quantity_failed = ?,
            overall_result = ?,
            tested_by = ?
        WHERE id = ?
      `,
        [quantityPassed, quantityFailed, overallResult, userId, row.id],
      );

      remainingRedo -= moved;
    }

    const summary = await getTestingSummary(connection, productionId);
    const qualityControl = await getQualityControlSummary(
      connection,
      productionId,
    );
    const finish = await finishOrderIfReady(
      connection,
      await getProductionOrder(connection, productionId),
      summary,
      qualityControl,
      userId,
    );

    await connection.commit();

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
          : "Redo testing result saved successfully",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function finishOrderIfReady(
  connection,
  production,
  testing,
  qualityControl,
  userId = null,
) {
  const ordered = Number(production.ordered_quantity);
  const ready =
    Number(production.quantity_completed) >= ordered &&
    Number(testing.remainingToTest) === 0 &&
    Number(testing.quantityFailed) === 0 &&
    Number(qualityControl.quantityInspected) >= ordered &&
    Number(qualityControl.quantityApproved) >= ordered &&
    Number(qualityControl.quantityRejected) === 0;

  if (!ready) {
    const status =
      Number(production.quantity_completed) < ordered
        ? "IN_PRODUCTION"
        : "TESTING";
    await connection.query(
      `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`,
      [status, production.order_id],
    );
    return null;
  }

  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM finished_goods WHERE order_id = ?`,
    [production.order_id],
  );
  const existing = Number(rows[0].quantity);
  const missing = Math.max(0, ordered - existing);

  let finishedGoods = null;
  if (missing > 0) {
    finishedGoods = await createFinishedGood(
      production.id,
      production.order_id,
      missing,
      connection,
      userId,
    );
  } else {
    await connection.query(
      `UPDATE orders SET status = 'PACKAGING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('COMPLETED')`,
      [production.order_id],
    );
  }

  return {
    readyForFinishedGoods: true,
    finishedGoodsId: finishedGoods?.finishedGoodsId || null,
  };
}

async function redoQualityControl(productionId, redoApproved, userId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const production = await getProductionOrder(connection, productionId);

    if (!Number.isInteger(redoApproved) || redoApproved < 0) {
      throw new AppError(400, "Redo approved quantity must be a non-negative integer");
    }

    const [rows] = await connection.query(
      `
      SELECT id, quantity_approved, quantity_rejected
      FROM quality_control_records
      WHERE production_id = ? AND quantity_rejected > 0
      ORDER BY id DESC
      FOR UPDATE
    `,
      [productionId],
    );

    const totalRejected = rows.reduce(
      (sum, row) => sum + Number(row.quantity_rejected),
      0,
    );

    if (redoApproved > totalRejected) {
      throw new AppError(400,
        `Redo approved quantity cannot exceed total rejected quantity. Rejected: ${totalRejected}`,
      );
    }

    let remainingRedo = redoApproved;

    for (const row of rows) {
      if (remainingRedo <= 0) break;

      const rejected = Number(row.quantity_rejected);
      const approved = Number(row.quantity_approved);
      const moved = Math.min(remainingRedo, rejected);
      const nextRejected = rejected - moved;
      const nextApproved = approved + moved;
      const overallResult = nextRejected === 0 ? "PASS" : "FAIL";

      await connection.query(
        `
        UPDATE quality_control_records
        SET quantity_approved = ?, quantity_rejected = ?, overall_result = ?, checked_by = ?
        WHERE id = ?
      `,
        [nextApproved, nextRejected, overallResult, userId, row.id],
      );

      remainingRedo -= moved;
    }

    const qualityControl = await getQualityControlSummary(
      connection,
      productionId,
    );
    const testing = await getTestingSummary(connection, productionId);
    const finish = await finishOrderIfReady(
      connection,
      production,
      testing,
      qualityControl,
      userId,
    );

    await connection.commit();

    return {
      success: true,
      productionId,
      quantityInspected: qualityControl.quantityInspected,
      quantityApproved: qualityControl.quantityApproved,
      quantityRejected: qualityControl.quantityRejected,
      overallResult: qualityControl.quantityRejected === 0 ? "PASS" : "FAIL",
      readyForFinishedGoods: !!finish?.readyForFinishedGoods,
      finishedGoodsId: finish?.finishedGoodsId || null,
      message:
        qualityControl.quantityRejected === 0
          ? "All rejected units fixed. QC now passes."
          : "QC edit result saved successfully",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveQualityControlResult(
  productionId,
  quantity,
  overallResult,
  remarks,
  userId,
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const production = await getProductionOrder(connection, productionId);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, "QC quantity must be a positive integer");
    }

    if (!["PASS", "FAIL"].includes(overallResult)) {
      throw new AppError(400, "Overall QC result must be PASS or FAIL");
    }

    const summary = await getQualityControlSummary(connection, productionId);

    if (quantity > summary.availableForQC) {
      throw new AppError(409,
        `Cannot inspect more than the quantity available for QC. Available: ${summary.availableForQC}`,
      );
    }

    const approved = overallResult === "PASS" ? quantity : 0;
    const rejected = overallResult === "FAIL" ? quantity : 0;

    const [result] = await connection.query(
      `
      INSERT INTO quality_control_records
        (production_id, quantity_inspected, quantity_approved, quantity_rejected, overall_result, remarks, checked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        production.id,
        quantity,
        approved,
        rejected,
        overallResult,
        remarks || null,
        userId,
      ],
    );

    const testing = await getTestingSummary(connection, productionId);
    const qualityControl = await getQualityControlSummary(
      connection,
      productionId,
    );
    const finish = await finishOrderIfReady(
      connection,
      production,
      testing,
      qualityControl,
      userId,
    );

    await connection.commit();

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
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function decideBatch(productionId, decision, remarks, userId) {
  if (!["PASS", "FAIL"].includes(decision)) {
    throw new AppError(400, "Batch decision must be PASS or FAIL");
  }

  const cleanRemarks = String(remarks || "").trim();
  if (decision === "FAIL" && !cleanRemarks) {
    throw new AppError(400, "A remark is required when a batch fails Quality Control");
  }
  if (cleanRemarks.length > 2000) {
    throw new AppError(400, "QC remarks must be 2,000 characters or fewer");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Serialize decisions and rework transitions for this production batch.
    const [locked] = await connection.query(
      "SELECT id FROM production_orders WHERE id = ? FOR UPDATE",
      [productionId],
    );
    if (!locked.length) throw new AppError(404, "Production batch not found");

    const production = await getProductionOrder(connection, productionId);
    const completed = Number(production.quantity_completed);
    const ordered = Number(production.ordered_quantity);
    if (ordered <= 0 || completed < ordered) {
      throw new AppError(409, "Quality Control is available only after the entire production batch is completed");
    }

    const [latestRows] = await connection.query(
      `SELECT id, decision, attempt_number
       FROM quality_control_batch_decisions
       WHERE production_id = ?
       ORDER BY attempt_number DESC
       LIMIT 1 FOR UPDATE`,
      [productionId],
    );
    const latest = latestRows[0] || null;

    let reworkCycle = null;
    if (latest?.decision === "PASS") {
      throw new AppError(409, "This batch has already passed Quality Control");
    }
    if (latest?.decision === "FAIL") {
      const [cycles] = await connection.query(
        `SELECT id, status
         FROM quality_control_rework_cycles
         WHERE production_id = ? AND failed_attempt_number = ?
         LIMIT 1 FOR UPDATE`,
        [productionId, latest.attempt_number],
      );
      reworkCycle = cycles[0] || null;
      if (!reworkCycle || reworkCycle.status !== "READY_FOR_QC") {
        throw new AppError(409, "Production must finish and submit rework before QC can decide this batch again");
      }
    }

    // Legacy releases from the old testing/inspection flow must not be re-released.
    const [existingFinishedGoods] = await connection.query(
      "SELECT id FROM finished_goods WHERE production_id = ? OR order_id = ? LIMIT 1 FOR UPDATE",
      [productionId, production.order_id],
    );
    if (existingFinishedGoods.length) {
      throw new AppError(409, "This batch has already been released to Finished Goods");
    }

    const attemptNumber = latest ? Number(latest.attempt_number) + 1 : 1;

    // A submitted rework cycle has now received its retest decision. Keep it as history.
    if (reworkCycle) {
      await connection.query(
        `UPDATE quality_control_rework_cycles
         SET status = 'QC_REVIEWED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId || null, reworkCycle.id],
      );
    }

    const [insertResult] = await connection.query(
      `INSERT INTO quality_control_batch_decisions
         (production_id, attempt_number, decision, remarks, decided_by)
       VALUES (?, ?, ?, ?, ?)`,
      [productionId, attemptNumber, decision, cleanRemarks || null, userId || null],
    );

    let finishedGoods = null;
    if (decision === "PASS") {
      finishedGoods = await createFinishedGood(
        production.id,
        production.order_id,
        ordered,
        connection,
        userId,
      );
    } else {
      await connection.query(
        `INSERT INTO quality_control_rework_cycles
           (production_id, failed_attempt_number, failure_decision_id, status)
         VALUES (?, ?, ?, 'NEEDS_REWORK')`,
        [productionId, attemptNumber, insertResult.insertId],
      );
    }

    await connection.commit();
    return {
      success: true,
      decisionId: insertResult.insertId,
      productionId,
      attemptNumber,
      decision,
      remarks: cleanRemarks || null,
      finishedGoodsId: finishedGoods?.finishedGoodsId || null,
      finishedGoodsStatus: finishedGoods?.status || null,
      message: decision === "PASS"
        ? `Batch passed QC on attempt ${attemptNumber} and was sent to Finished Goods`
        : `Batch failed QC on attempt ${attemptNumber}; Production has been assigned rework`,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getQualityControlOrders() {
  const connection = await db.getConnection();

  try {
    const [rows] = await connection.query(`
      SELECT
        po.id,
        po.order_id,
        o.status AS order_status,
        po.quantity_to_produce,
        po.quantity_completed,
        po.started_at,
        po.completed_at,
        o.order_number,
        oi.quantity AS ordered_quantity,
        p.name AS product_name,
        p.sku AS product_sku,
        COALESCE((SELECT SUM(t.quantity_tested) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_tested,
        COALESCE((SELECT SUM(t.quantity_passed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_passed,
        COALESCE((SELECT SUM(t.quantity_failed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_failed,
        COALESCE((SELECT SUM(q.quantity_inspected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_inspected,
        COALESCE((SELECT SUM(q.quantity_approved) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_approved,
        COALESCE((SELECT SUM(q.quantity_rejected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_rejected,
        qbd.id AS batch_decision_id,
        qbd.attempt_number AS batch_attempt_number,
        qbd.decision AS recorded_batch_decision,
        qbd.remarks AS batch_decision_remarks,
        qbd.decided_at AS batch_decided_at,
        decision_user.name AS batch_decided_by_name,
        rc.id AS rework_id,
        rc.status AS rework_status,
        rc.failed_attempt_number AS rework_attempt_number,
        rc.rework_remarks,
        rc.started_at AS rework_started_at,
        rc.submitted_at AS rework_submitted_at,
        rework_started_user.name AS rework_started_by_name,
        rework_submitted_user.name AS rework_submitted_by_name,
        fg.id AS finished_goods_id,
        fg.created_at AS finished_goods_created_at,
        fg_user.name AS finished_goods_created_by_name,
        fg.status AS finished_goods_status
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN quality_control_batch_decisions qbd ON qbd.id = (
        SELECT d.id FROM quality_control_batch_decisions d
        WHERE d.production_id = po.id
        ORDER BY d.attempt_number DESC LIMIT 1
      )
      LEFT JOIN users decision_user ON decision_user.id = qbd.decided_by
      LEFT JOIN quality_control_rework_cycles rc ON rc.id = (
        SELECT r.id FROM quality_control_rework_cycles r
        WHERE r.production_id = po.id
        ORDER BY r.failed_attempt_number DESC LIMIT 1
      )
      LEFT JOIN users rework_started_user ON rework_started_user.id = rc.started_by
      LEFT JOIN users rework_submitted_user ON rework_submitted_user.id = rc.submitted_by
      LEFT JOIN finished_goods fg ON fg.production_id = po.id
      LEFT JOIN users fg_user ON fg_user.id = fg.created_by
      WHERE oi.quantity > 0 AND po.quantity_completed >= oi.quantity
      ORDER BY
        CASE
          WHEN qbd.id IS NULL AND fg.id IS NULL THEN 0
          WHEN rc.status = 'READY_FOR_QC' THEN 0
          ELSE 1
        END,
        COALESCE(qbd.decided_at, fg.created_at, po.completed_at) DESC,
        po.id DESC
    `);

    const [historyRows] = await connection.query(`
      SELECT d.id, d.production_id, d.attempt_number, d.decision, d.remarks,
             d.decided_at, u.name AS decided_by_name,
             r.status AS rework_status, r.rework_remarks,
             r.started_at AS rework_started_at, r.submitted_at AS rework_submitted_at
      FROM quality_control_batch_decisions d
      LEFT JOIN users u ON u.id = d.decided_by
      LEFT JOIN quality_control_rework_cycles r
        ON r.production_id = d.production_id
       AND r.failed_attempt_number = d.attempt_number
      ORDER BY d.production_id, d.attempt_number
    `);
    const historyByProduction = new Map();
    for (const entry of historyRows) {
      const key = Number(entry.production_id);
      if (!historyByProduction.has(key)) historyByProduction.set(key, []);
      historyByProduction.get(key).push({
        id: entry.id,
        attemptNumber: Number(entry.attempt_number),
        decision: entry.decision,
        remarks: entry.remarks || "",
        decidedAt: entry.decided_at,
        decidedByName: entry.decided_by_name || null,
        reworkStatus: entry.rework_status || null,
        reworkRemarks: entry.rework_remarks || null,
        reworkStartedAt: entry.rework_started_at || null,
        reworkSubmittedAt: entry.rework_submitted_at || null,
      });
    }

    return rows.map((row) => {
      const ordered = Number(row.ordered_quantity);
      const completed = Number(row.quantity_completed);
      const tested = Number(row.quantity_tested);
      const passed = Number(row.quantity_passed);
      const failed = Number(row.quantity_failed);
      const inspected = Number(row.quantity_inspected);
      const approved = Number(row.quantity_approved);
      const rejected = Number(row.quantity_rejected);
      const remainingToTest = Math.max(0, completed - tested);
      const availableForQC = Math.max(0, passed - inspected);
      const latestDecision = row.recorded_batch_decision || (row.finished_goods_id ? "PASS" : null);
      const pendingRetest = latestDecision === "FAIL" && row.rework_status === "READY_FOR_QC";
      // A submitted rework batch appears in the pending queue again; the old FAIL remains in attempt history.
      const batchDecision = pendingRetest ? null : latestDecision;
      const decisionAt = row.batch_decided_at || row.finished_goods_created_at || null;
      const decisionByName = row.batch_decided_by_name || row.finished_goods_created_by_name || null;
      const legacyFinishedGoodsPass = !row.recorded_batch_decision && !!row.finished_goods_id;
      const readyForFinishedGoods = latestDecision === "PASS" || (!latestDecision && (
        completed >= ordered && remainingToTest === 0 && failed === 0 &&
        inspected >= ordered && approved >= ordered && rejected === 0
      ));

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
        batchDecision,
        latestDecision,
        attemptNumber: pendingRetest ? Number(row.batch_attempt_number || 0) + 1 : Number(row.batch_attempt_number || 1),
        decisionRemarks: row.batch_decision_remarks || "",
        decisionAt,
        decisionByName,
        decisionHistory: historyByProduction.get(Number(row.id)) || [],
        legacyFinishedGoodsPass,
        finishedGoodsId: row.finished_goods_id || null,
        finishedGoodsStatus: row.finished_goods_status || null,
        reworkId: row.rework_id || null,
        reworkStatus: row.rework_status || null,
        reworkAttemptNumber: row.rework_attempt_number || null,
        reworkRemarks: row.rework_remarks || null,
        reworkStartedAt: row.rework_started_at || null,
        reworkSubmittedAt: row.rework_submitted_at || null,
        reworkStartedByName: row.rework_started_by_name || null,
        reworkSubmittedByName: row.rework_submitted_by_name || null,
        status: row.order_status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      };
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  getQualityControlOrders,
  decideBatch,
  getQualityControlInfo,
  saveTestingResult,
  redoTesting,
  redoQualityControl,
  saveQualityControlResult,
};

const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const { createFinishedGood } = require("../finished-goods/finished-goods.service");
const { targetQuantitySql } = require("../production/production-target");
const { refreshOrderStatus } = require("../orders/order-status");

// ordered_quantity = what this production run has to build for its product (approved quantity, see production-target.js)
const productionQuery = `
  SELECT po.id, po.order_id, po.status, po.quantity_to_produce, po.quantity_completed,
         o.order_number, o.status AS order_status, po.product_id, ${targetQuantitySql("po", "o")} AS ordered_quantity,
         p.sku AS product_sku, p.name AS product_name
  FROM production_orders po
  JOIN orders o ON o.id = po.order_id
  JOIN products p ON p.id = po.product_id
  WHERE po.id = ? LIMIT 1
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
    // the order's status follows ALL of its products, not just this one
    await refreshOrderStatus(connection, production.order_id);
    return null;
  }

  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM finished_goods WHERE production_id = ?`,
    [production.id],
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
    await refreshOrderStatus(connection, production.order_id);
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
             po.started_at, po.completed_at, o.order_number, ${targetQuantitySql("po", "o")} AS ordered_quantity,
             p.name AS product_name, p.sku AS product_sku,
             COALESCE((SELECT SUM(t.quantity_tested) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_tested,
             COALESCE((SELECT SUM(t.quantity_passed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_passed,
             COALESCE((SELECT SUM(t.quantity_failed) FROM testing_records t WHERE t.production_id = po.id),0) AS quantity_failed,
             COALESCE((SELECT SUM(q.quantity_inspected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_inspected,
             COALESCE((SELECT SUM(q.quantity_approved) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_approved,
             COALESCE((SELECT SUM(q.quantity_rejected) FROM quality_control_records q WHERE q.production_id = po.id),0) AS quantity_rejected,
             (SELECT u.name FROM testing_records t JOIN users u ON u.id = t.tested_by WHERE t.production_id = po.id ORDER BY t.id DESC LIMIT 1) AS last_tested_by,
             (SELECT u.name FROM quality_control_records q JOIN users u ON u.id = q.checked_by WHERE q.production_id = po.id ORDER BY q.id DESC LIMIT 1) AS last_checked_by
      FROM production_orders po
      JOIN orders o ON o.id = po.order_id
      JOIN products p ON p.id = po.product_id
      WHERE po.quantity_completed > 0
      ORDER BY po.id DESC
    `);

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
      const readyForFinishedGoods =
        completed >= ordered &&
        remainingToTest === 0 &&
        failed === 0 &&
        inspected >= ordered &&
        approved >= ordered &&
        rejected === 0;

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
        status: row.order_status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        lastTestedBy: row.last_tested_by,
        lastCheckedBy: row.last_checked_by,
      };
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  getQualityControlOrders,
  getQualityControlInfo,
  saveTestingResult,
  redoTesting,
  redoQualityControl,
  saveQualityControlResult,
};

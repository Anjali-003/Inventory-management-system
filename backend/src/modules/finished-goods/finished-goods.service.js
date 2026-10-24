
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const { refreshOrderStatus } = require("../orders/order-status");

const selectSql = `
  SELECT
    fg.id,
    fg.production_id,
    fg.order_id,
    fg.quantity,
    fg.status,
    fg.created_at,
    fg.dispatched_at,
    fg.completed_at,
    o.order_number,
    products.product_id,
    products.product_sku,
    products.product_name,
    products.product_count,
    cu.name AS created_by_name,
    du.name AS dispatched_by_name,
    xu.name AS completed_by_name
  FROM finished_goods fg
  JOIN orders o ON o.id = fg.order_id
  JOIN (
    SELECT
      oi.order_id,
      MIN(oi.product_id) AS product_id,
      GROUP_CONCAT(
        p.sku ORDER BY oi.id SEPARATOR ', '
      ) AS product_sku,
      GROUP_CONCAT(
        p.name ORDER BY oi.id SEPARATOR ' + '
      ) AS product_name,
      COUNT(*) AS product_count
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    GROUP BY oi.order_id
  ) products ON products.order_id = fg.order_id
  LEFT JOIN users cu ON cu.id = fg.created_by
  LEFT JOIN users du ON du.id = fg.dispatched_by
  LEFT JOIN users xu ON xu.id = fg.completed_by
`;

const mapRow = (r) => ({
  id: r.id,
  productionId: r.production_id,
  orderId: r.order_id,
  orderNumber: r.order_number,
  productId: r.product_id,
  productSku: r.product_sku,
  productName: r.product_name,
  productCount: Number(r.product_count || 1),
  quantity: Number(r.quantity),
  status: r.status,
  createdAt: r.created_at,
  dispatchedAt: r.dispatched_at,
  completedAt: r.completed_at,
  createdByName: r.created_by_name,
  dispatchedByName: r.dispatched_by_name,
  completedByName: r.completed_by_name,
});

async function getFinishedGoods() {
  const [rows] = await db.query(
    `${selectSql} ORDER BY fg.id DESC`
  );

  return rows.map(mapRow);
}

async function getFinishedGood(id) {
  const [rows] = await db.query(
    `${selectSql} WHERE fg.id = ? LIMIT 1`,
    [id]
  );

  if (!rows.length) {
    throw new AppError(
      404,
      "Finished goods record not found"
    );
  }

  return mapRow(rows[0]);
}

async function createFinishedGood(
  productionId,
  orderId,
  quantity,
  connection = null,
  userId = null
) {
  const own = !connection;
  connection ??= await db.getConnection();

  try {
    if (
      !Number.isSafeInteger(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      throw new AppError(
        400,
        "Finished goods quantity must be a positive integer"
      );
    }

    // Validate the production order and its associated order item.
    const [production] = await connection.query(
      `
        SELECT
          po.id,
          po.order_id,
          po.order_item_id,
          po.quantity_completed,
          oi.quantity AS ordered_quantity
        FROM production_orders po
        JOIN order_items oi
          ON oi.id = po.order_item_id
        WHERE po.id = ?
        LIMIT 1
      `,
      [productionId]
    );

    if (!production.length) {
      throw new AppError(
        404,
        "Production order not found"
      );
    }

    if (
      Number(production[0].order_id) !==
      Number(orderId)
    ) {
      throw new AppError(
        400,
        "Production order does not belong to the specified order"
      );
    }

    // Lock the parent order while checking readiness and creating FG.
    const [order] = await connection.query(
      `
        SELECT id, status
        FROM orders
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );

    if (!order.length) {
      throw new AppError(404, "Order not found");
    }

    // Finished Goods is created only after every product line
    // completes production and passes its latest QC attempt.
    const [productLines] = await connection.query(
      `
        SELECT
          oi.id AS order_item_id,
          oi.quantity AS ordered_quantity,
          po.id AS production_id,
          po.quantity_completed,
          latest.decision AS batch_decision,
          COALESCE(
            testing.quantity_tested, 0
          ) AS quantity_tested,
          COALESCE(
            testing.quantity_failed, 0
          ) AS quantity_failed,
          COALESCE(
            qc.quantity_inspected, 0
          ) AS quantity_inspected,
          COALESCE(
            qc.quantity_approved, 0
          ) AS quantity_approved,
          COALESCE(
            qc.quantity_rejected, 0
          ) AS quantity_rejected
        FROM order_items oi
        LEFT JOIN production_orders po
          ON po.order_item_id = oi.id
        LEFT JOIN quality_control_batch_decisions latest
          ON latest.id = (
            SELECT d.id
            FROM quality_control_batch_decisions d
            WHERE d.production_id = po.id
            ORDER BY d.attempt_number DESC
            LIMIT 1
          )
        LEFT JOIN (
          SELECT
            production_id,
            SUM(quantity_tested) AS quantity_tested,
            SUM(quantity_failed) AS quantity_failed
          FROM testing_records
          GROUP BY production_id
        ) testing
          ON testing.production_id = po.id
        LEFT JOIN (
          SELECT
            production_id,
            SUM(quantity_inspected) AS quantity_inspected,
            SUM(quantity_approved) AS quantity_approved,
            SUM(quantity_rejected) AS quantity_rejected
          FROM quality_control_records
          GROUP BY production_id
        ) qc
          ON qc.production_id = po.id
        WHERE oi.order_id = ?
        ORDER BY oi.id
      `,
      [orderId]
    );

    if (!productLines.length) {
      throw new AppError(
        409,
        "The order has no product lines"
      );
    }

    const allProductsReady = productLines.every(
      (line) => {
        const ordered = Number(line.ordered_quantity);
        const completed = Number(
          line.quantity_completed || 0
        );

        if (
          !line.production_id ||
          ordered <= 0 ||
          completed < ordered
        ) {
          return false;
        }

        // Use the latest batch decision when available.
        if (line.batch_decision) {
          return line.batch_decision === "PASS";
        }

        // Fall back to the legacy quantity-based QC workflow.
        return (
          Number(line.quantity_tested) >= ordered &&
          Number(line.quantity_failed) === 0 &&
          Number(line.quantity_inspected) >= ordered &&
          Number(line.quantity_approved) >= ordered &&
          Number(line.quantity_rejected) === 0
        );
      }
    );

    if (!allProductsReady) {
      return {
        success: true,
        readyForFinishedGoods: false,
        finishedGoodsId: null,
        productionId,
        orderId,
        status: null,
        message:
          "Waiting for every product in the order to complete production and pass Quality Control",
      };
    }

    // Calculate the total units across all order lines.
    const totalQuantity = productLines.reduce(
      (sum, line) =>
        sum + Number(line.ordered_quantity),
      0
    );

    if (
      !Number.isSafeInteger(totalQuantity) ||
      totalQuantity <= 0
    ) {
      throw new AppError(
        409,
        "The total ordered quantity is not a valid whole number"
      );
    }

    // One Finished Goods record per parent order.
    const [existing] = await connection.query(
      `
        SELECT id, status, quantity
        FROM finished_goods
        WHERE order_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [orderId]
    );

    if (existing.length) {
      return {
        success: true,
        readyForFinishedGoods: true,
        finishedGoodsId: existing[0].id,
        productionId,
        orderId,
        quantity: Number(existing[0].quantity),
        status: existing[0].status,
        message:
          "Finished goods already exist for this order",
      };
    }

    const [result] = await connection.query(
      `
        INSERT INTO finished_goods (
          production_id,
          order_id,
          quantity,
          status,
          created_by
        )
        VALUES (?, ?, ?, 'PACKAGING', ?)
      `,
      [
        productionId,
        orderId,
        totalQuantity,
        userId,
      ]
    );

    await connection.query(
      `
        UPDATE orders
        SET
          status = 'PACKAGING',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status NOT IN ('COMPLETED')
      `,
      [orderId]
    );

    return {
      success: true,
      readyForFinishedGoods: true,
      finishedGoodsId: result.insertId,
      productionId,
      orderId,
      quantity: totalQuantity,
      status: "PACKAGING",
      message:
        "All products passed Quality Control. The order is ready for packaging.",
    };
  } finally {
    if (own) {
      connection.release();
    }
  }
}

async function transition(
  id,
  from,
  to,
  timestampColumn,
  userColumn,
  userId
) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT id, order_id, status
        FROM finished_goods
        WHERE id = ?
        FOR UPDATE
      `,
      [id]
    );

    if (!rows.length) {
      throw new AppError(
        404,
        "Finished goods record not found"
      );
    }

    if (rows[0].status !== from) {
      throw new AppError(
        409,
        `Cannot ${
          to === "DISPATCHED"
            ? "dispatch"
            : "complete"
        } finished goods with status ${rows[0].status}`
      );
    }

    await connection.query(
      `
        UPDATE finished_goods
        SET
          status = ?,
          ${timestampColumn} = CURRENT_TIMESTAMP,
          ${userColumn} = ?
        WHERE id = ?
      `,
      [to, userId, id]
    );

    if (to === "DISPATCHED") {
      // Recalculate order status after dispatch.
      await refreshOrderStatus(
        connection,
        rows[0].order_id
      );
    } else {
      // Complete the order only when all ordered units
      // have reached the COMPLETED Finished Goods status.
      const [totals] = await connection.query(
        `
          SELECT
            COALESCE(
              (
                SELECT SUM(quantity)
                FROM order_items
                WHERE order_id = ?
              ),
              0
            ) AS ordered,
            COALESCE(
              (
                SELECT SUM(quantity)
                FROM finished_goods
                WHERE order_id = ?
                  AND status = 'COMPLETED'
              ),
              0
            ) AS completed
        `,
        [
          rows[0].order_id,
          rows[0].order_id,
        ]
      );

      if (
        Number(totals[0].completed) >=
        Number(totals[0].ordered)
      ) {
        await connection.query(
          `
            UPDATE orders
            SET
              status = 'COMPLETED',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [rows[0].order_id]
        );
      } else {
        await refreshOrderStatus(
          connection,
          rows[0].order_id
        );
      }
    }

    await connection.commit();

    return {
      success: true,
      finishedGoodsId: id,
      status: to,
      message:
        `Finished goods marked as ${to.toLowerCase()} successfully`,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const markDispatched = (id, userId = null) =>
  transition(
    id,
    "PACKAGING",
    "DISPATCHED",
    "dispatched_at",
    "dispatched_by",
    userId
  );

const markCompleted = (id, userId = null) =>
  transition(
    id,
    "DISPATCHED",
    "COMPLETED",
    "completed_at",
    "completed_by",
    userId
  );

module.exports = {
  getFinishedGoods,
  getFinishedGood,
  createFinishedGood,
  markDispatched,
  markCompleted,
};

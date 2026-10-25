
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const notifications = require("../notifications/notification.service");
const { inTransaction } = require("../inventory/inventory.service");
const productStock = require("../product-stock/product-stock.service");

const selectSql = `
  SELECT
    fg.id,
    fg.production_id,
    fg.order_id,
    fg.quantity,
    fg.status,
    fg.created_at,
    fg.packed_at,
    fg.handed_over_at,
    fg.received_at,
    fg.dispatched_at,
    fg.dispatch_note,
    fg.delivered_at,
    fg.delivery_note,
    o.order_number,
    b.id AS bill_id,
    b.bill_number,
    b.customer_name,
    b.total AS bill_total,
    b.created_at AS billed_at,
    products.product_id,
    products.product_sku,
    products.product_name,
    products.product_count,
    cu.name AS created_by_name,
    pu.name AS packed_by_name,
    hu.name AS handed_over_by_name,
    ru.name AS received_by_name,
    bu.name AS billed_by_name,
    du.name AS dispatched_by_name,
    lu.name AS delivered_by_name
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
  LEFT JOIN bills b ON b.finished_goods_id = fg.id
  LEFT JOIN users pu ON pu.id = fg.packed_by
  LEFT JOIN users hu ON hu.id = fg.handed_over_by
  LEFT JOIN users ru ON ru.id = fg.received_by
  LEFT JOIN users bu ON bu.id = b.created_by
  LEFT JOIN users du ON du.id = fg.dispatched_by
  LEFT JOIN users lu ON lu.id = fg.delivered_by
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
  createdByName: r.created_by_name,
  packedAt: r.packed_at,
  packedByName: r.packed_by_name,
  handedOverAt: r.handed_over_at,
  handedOverByName: r.handed_over_by_name,
  receivedAt: r.received_at,
  receivedByName: r.received_by_name,
  billedAt: r.billed_at,
  billedByName: r.billed_by_name,
  dispatchedAt: r.dispatched_at,
  dispatchedByName: r.dispatched_by_name,
  dispatchNote: r.dispatch_note,
  deliveredAt: r.delivered_at,
  deliveredByName: r.delivered_by_name,
  deliveryNote: r.delivery_note,
  bill: r.bill_id
    ? { id: r.bill_id, billNumber: r.bill_number, customerName: r.customer_name, total: Number(r.bill_total) }
    : null,
  lines: [],
});

/* The products inside each record: one line per product of the order (what Store receives and Marketing bills). */
async function attachLines(conn, items) {
  if (!items.length) return items;
  const [rows] = await conn.query(
    `SELECT oi.order_id, p.id AS product_id, p.sku, p.name, CAST(SUM(oi.quantity) AS SIGNED) AS quantity
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (?)
     GROUP BY oi.order_id, p.id, p.sku, p.name
     ORDER BY MIN(oi.id)`,
    [[...new Set(items.map((i) => i.orderId))]]
  );
  for (const item of items) {
    item.lines = rows
      .filter((r) => Number(r.order_id) === item.orderId)
      .map((r) => ({ productId: r.product_id, sku: r.sku, name: r.name, quantity: Number(r.quantity) }));
  }
  return items;
}

async function getFinishedGoods() {
  const [rows] = await db.query(
    `${selectSql} ORDER BY fg.id DESC`
  );

  return attachLines(db, rows.map(mapRow));
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

  const [item] = await attachLines(db, [mapRow(rows[0])]);
  return item;
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


/*
  After Quality Control every record moves through these steps. Each step has ONE owner role
  (the route checks it, see finished-goods.routes.js) and tells the next owner through a notification.
  The order's status follows the record, and DELIVERED completes the order.
*/
const STEPS = {
  pack:     { from: "PACKAGING",   to: "PACKED",      at: "packed_at",      by: "packed_by",
              next: "OPERATIONS_ADMIN",  title: (n) => `Order ${n} is packed`,               body: "Hand it over to the Store." },
  handOver: { from: "PACKED",      to: "HANDED_OVER", at: "handed_over_at", by: "handed_over_by",
              next: "STORE_MANAGER",     title: (n) => `Order ${n} is handed over to Store`, body: "Receive it into product stock." },
  receive:  { from: "HANDED_OVER", to: "IN_STORE",    at: "received_at",    by: "received_by",
              next: "MARKETING_MANAGER", title: (n) => `Order ${n} is in the Store`,         body: "It is ready for billing." },
  dispatch: { from: "BILLED",      to: "DISPATCHED",  at: "dispatched_at",  by: "dispatched_by", note: "dispatch_note",
              next: "MARKETING_MANAGER", title: (n) => `Order ${n} has left the Store`,      body: "Confirm when the customer receives it." },
  deliver:  { from: "DISPATCHED",  to: "DELIVERED",   at: "delivered_at",   by: "delivered_by",  note: "delivery_note",
              next: "OPERATIONS_ADMIN",  title: (n) => `Order ${n} is delivered`,            body: "The order is complete." },
};

// what each finished-goods status means for the whole order (DELIVERED completes it)
const ORDER_STATUS_OF = { PACKED: "PACKED", HANDED_OVER: "HANDED_OVER", IN_STORE: "IN_STORE", BILLED: "BILLED", DISPATCHED: "DISPATCHED", DELIVERED: "COMPLETED" };

function cleanText(raw, max = 255) {
  const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (text.length > max) throw new AppError(422, `Text must be ${max} characters or fewer`, "VALIDATION");
  return text || null;
}

async function lockRecord(conn, id, from) {
  const [rows] = await conn.query(
    `SELECT fg.id, fg.order_id, fg.status, o.order_number
     FROM finished_goods fg JOIN orders o ON o.id = fg.order_id
     WHERE fg.id = ? FOR UPDATE`,
    [id]
  );
  if (!rows.length) throw new AppError(404, "Finished goods record not found");
  if (rows[0].status !== from) {
    throw new AppError(409, `This step cannot be done now: the order is at "${rows[0].status}", it must be at "${from}"`, "WRONG_STATUS");
  }
  return rows[0];
}

/* the products of the order with their whole quantities (what Store receives / gives out, what Marketing bills) */
async function orderLines(conn, orderId) {
  const [lines] = await conn.query(
    `SELECT product_id, CAST(SUM(quantity) AS SIGNED) AS quantity FROM order_items WHERE order_id = ? GROUP BY product_id`,
    [orderId]
  );
  return lines.map((l) => ({ productId: Number(l.product_id), quantity: Number(l.quantity) }));
}

async function moveTo(conn, record, to, set = "", params = []) {
  await conn.query(`UPDATE finished_goods SET status = ?${set} WHERE id = ?`, [to, ...params, record.id]);
  await conn.query(
    `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [ORDER_STATUS_OF[to], record.order_id]
  );
}

async function tell(conn, { to, next, title, body }, record, userId) {
  const orderNumber = record.order_number || `#${record.order_id}`;
  await notifications.notify(conn, {
    role: next,
    type: `FINISHED_GOODS_${to}`,
    title: title(orderNumber),
    body,
    severity: to === "DELIVERED" ? "success" : "action",
    link: "/finished-goods",
    orderId: record.order_id,
    payload: { order_number: orderNumber, finished_goods_id: record.id, status: to },
    userId,
  });
}

/* pack, handOver, receive, dispatch, deliver: one call per step. body.note is saved by dispatch / deliver. */
async function advance(stepName, id, body = {}, userId = null) {
  const step = STEPS[stepName];
  const note = step.note ? cleanText(body.note) : null;

  return inTransaction(async (conn) => {
    const record = await lockRecord(conn, id, step.from);

    if (stepName === "receive" || stepName === "dispatch") {
      const receiving = stepName === "receive";
      await productStock.post(conn, await orderLines(conn, record.order_id), {
        direction: receiving ? "IN" : "OUT",
        reason: receiving
          ? `Received from Operations Admin, order ${record.order_number}`
          : `Given out for delivery, order ${record.order_number}${note ? ` (${note})` : ""}`,
        finishedGoodsId: record.id,
        orderId: record.order_id,
        userId,
      });
    }

    const set = `, ${step.at} = CURRENT_TIMESTAMP, ${step.by} = ?${step.note ? `, ${step.note} = ?` : ""}`;
    await moveTo(conn, record, step.to, set, step.note ? [userId, note] : [userId]);
    await tell(conn, step, record, userId);

    return { success: true, finishedGoodsId: id, status: step.to };
  });
}

/* ---------------------------------------------------------------- billing (Marketing) */

const money = (cents) => Number((cents / 100).toFixed(2));

function parseBill(body) {
  const customerName = cleanText(body.customer_name, 150);
  if (!customerName) throw new AppError(422, "Customer name is required", "VALIDATION");
  const gst = Number(body.gst_percent);
  if (body.gst_percent === "" || !Number.isFinite(gst) || gst < 0 || gst > 100) {
    throw new AppError(422, "GST % must be between 0 and 100", "VALIDATION");
  }
  if (!Array.isArray(body.items) || !body.items.length) throw new AppError(422, "Enter a rate for every product", "VALIDATION");
  const rates = new Map();
  for (const item of body.items) {
    const productId = Number(item.product_id);
    const rate = Number(item.rate);
    if (!Number.isInteger(productId) || productId <= 0) throw new AppError(422, "A product is invalid", "VALIDATION");
    if (item.rate === "" || !Number.isFinite(rate) || rate < 0) throw new AppError(422, "Rate must be zero or more", "VALIDATION");
    rates.set(productId, Math.round(rate * 100));
  }
  const customerId = body.customer_id === undefined || body.customer_id === null || body.customer_id === "" ? null : Number(body.customer_id);
  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) throw new AppError(422, "The customer is invalid", "VALIDATION");
  return {
    customerId,
    customerName,
    customerAddress: cleanText(body.customer_address, 500),
    customerGstin: cleanText(body.customer_gstin, 20),
    notes: cleanText(body.notes, 500),
    gstBasisPoints: Math.round(gst * 100),
    rates,
  };
}

async function createBill(id, body = {}, userId = null) {
  const bill = parseBill(body);

  return inTransaction(async (conn) => {
    const record = await lockRecord(conn, id, "IN_STORE");
    if (bill.customerId) {
      const [found] = await conn.query("SELECT id FROM customers WHERE id = ?", [bill.customerId]);
      if (!found.length) throw new AppError(422, "The selected customer no longer exists", "VALIDATION");
    }
    const lines = await orderLines(conn, record.order_id);
    if (bill.rates.size !== lines.length || lines.some((l) => !bill.rates.has(l.productId))) {
      throw new AppError(422, "Enter a rate for every product of this order", "VALIDATION");
    }

    const items = lines.map((l) => {
      const rate = bill.rates.get(l.productId);
      return { ...l, rate, amount: rate * l.quantity };
    });
    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    const gstAmount = Math.round((subtotal * bill.gstBasisPoints) / 10000);

    // bill number: BILL-<year>-<running number>, e.g. BILL-2026-0007 (the lock keeps two bills from taking one number)
    const year = new Date().getFullYear();
    const [[last]] = await conn.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(bill_number, '-', -1) AS UNSIGNED)), 0) AS n
       FROM bills WHERE bill_number LIKE ? FOR UPDATE`,
      [`BILL-${year}-%`]
    );
    const billNumber = `BILL-${year}-${String(Number(last.n) + 1).padStart(4, "0")}`;

    const [result] = await conn.query(
      `INSERT INTO bills (bill_number, finished_goods_id, order_id, customer_id, customer_name, customer_address, customer_gstin,
                          gst_percent, subtotal, gst_amount, total, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [billNumber, record.id, record.order_id, bill.customerId, bill.customerName, bill.customerAddress, bill.customerGstin,
        bill.gstBasisPoints / 100, money(subtotal), money(gstAmount), money(subtotal + gstAmount), bill.notes, userId]
    );
    for (const item of items) {
      await conn.query(
        `INSERT INTO bill_items (bill_id, product_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)`,
        [result.insertId, item.productId, item.quantity, money(item.rate), money(item.amount)]
      );
    }

    await moveTo(conn, record, "BILLED");
    await tell(conn, {
      to: "BILLED",
      next: "STORE_MANAGER",
      title: (n) => `Order ${n} is billed`,
      body: `Bill ${billNumber}. Give the goods out for delivery.`,
    }, record, userId);

    return { success: true, finishedGoodsId: id, status: "BILLED", billId: result.insertId, billNumber };
  });
}

async function getBill(id) {
  const [bills] = await db.query(
    `SELECT b.*, o.order_number, u.name AS created_by_name
     FROM bills b JOIN orders o ON o.id = b.order_id LEFT JOIN users u ON u.id = b.created_by
     WHERE b.finished_goods_id = ?`,
    [id]
  );
  if (!bills.length) throw new AppError(404, "No bill has been made for this order yet");
  const b = bills[0];
  const [items] = await db.query(
    `SELECT bi.product_id, p.sku, p.name, bi.quantity, bi.rate, bi.amount
     FROM bill_items bi JOIN products p ON p.id = bi.product_id WHERE bi.bill_id = ? ORDER BY bi.id`,
    [b.id]
  );
  return {
    id: b.id,
    billNumber: b.bill_number,
    orderNumber: b.order_number,
    customerName: b.customer_name,
    customerAddress: b.customer_address,
    customerGstin: b.customer_gstin,
    gstPercent: Number(b.gst_percent),
    subtotal: Number(b.subtotal),
    gstAmount: Number(b.gst_amount),
    total: Number(b.total),
    notes: b.notes,
    createdAt: b.created_at,
    createdByName: b.created_by_name,
    items: items.map((i) => ({
      productId: i.product_id, sku: i.sku, name: i.name,
      quantity: Number(i.quantity), rate: Number(i.rate), amount: Number(i.amount),
    })),
  };
}

module.exports = {
  getFinishedGoods,
  getFinishedGood,
  createFinishedGood,
  advance,
  createBill,
  getBill,
};

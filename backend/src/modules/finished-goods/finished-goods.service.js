
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
    oc.name AS order_customer_name,
    b.id AS bill_id,
    b.bill_number,
    b.customer_name,
    b.total AS bill_total,
    b.created_at AS billed_at,
    (SELECT COALESCE(SUM(bp.amount), 0) FROM bill_payments bp WHERE bp.bill_id = b.id) AS bill_paid,
    (SELECT COALESCE(SUM(cn.amount), 0) FROM bill_credit_notes cn WHERE cn.bill_id = b.id) AS bill_credited,
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
  LEFT JOIN customers oc ON oc.id = o.customer_id
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
  LEFT JOIN bills b ON b.finished_goods_id = fg.id AND b.status = 'ACTIVE'
  LEFT JOIN users pu ON pu.id = fg.packed_by
  LEFT JOIN users hu ON hu.id = fg.handed_over_by
  LEFT JOIN users ru ON ru.id = fg.received_by
  LEFT JOIN users bu ON bu.id = b.created_by
  LEFT JOIN users du ON du.id = fg.dispatched_by
  LEFT JOIN users lu ON lu.id = fg.delivered_by
`;

/* net = total - credit notes; due = what the customer still owes; refund = paid more than the net (after a credit) */
function billMoney(b) {
  const net = Math.round((b.total - b.credited) * 100) / 100;
  const due = Math.max(0, Math.round((net - b.paid) * 100) / 100);
  const refund = Math.max(0, Math.round((b.paid - net) * 100) / 100);
  const status = due === 0 ? "PAID" : b.paid > 0 ? "PART_PAID" : "UNPAID";
  return { ...b, net, due, refund, paymentStatus: status };
}

const mapRow = (r) => ({
  id: r.id,
  productionId: r.production_id,
  orderId: r.order_id,
  orderNumber: r.order_number,
  // the customer the order is for: the bill is made out to them
  customerName: r.order_customer_name || null,
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
  bill: r.bill_id ? billMoney({
    id: r.bill_id, billNumber: r.bill_number, customerName: r.customer_name,
    total: Number(r.bill_total), paid: Number(r.bill_paid), credited: Number(r.bill_credited),
  }) : null,
  lines: [],
});

/* The products inside each record: one line per product of the order (what Store receives and Marketing bills). */
async function attachLines(conn, items) {
  if (!items.length) return items;
  const [rows] = await conn.query(
    `SELECT oi.order_id, p.id AS product_id, p.sku, p.name, p.selling_price, p.gst_percent, CAST(SUM(oi.quantity) AS SIGNED) AS quantity,
            MAX(oi.agreed_rate) AS agreed_rate, MAX(oi.agreed_note) AS agreed_note
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (?)
     GROUP BY oi.order_id, p.id, p.sku, p.name, p.selling_price, p.gst_percent
     ORDER BY MIN(oi.id)`,
    [[...new Set(items.map((i) => i.orderId))]]
  );
  for (const item of items) {
    item.lines = rows
      .filter((r) => Number(r.order_id) === item.orderId)
      .map((r) => ({
        productId: r.product_id, sku: r.sku, name: r.name, quantity: Number(r.quantity),
        // price list (Super Admin); the bill starts from the rate agreed on the order when there is one, else the list
        listPrice: r.selling_price === null ? null : Number(r.selling_price), gstPercent: Number(r.gst_percent),
        agreedRate: r.agreed_rate == null ? null : Number(r.agreed_rate), agreedNote: r.agreed_note || null,
      }));
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
          created_by,
          packed_at,
          packed_by,
          handed_over_at,
          handed_over_by
        )
        VALUES (?, ?, ?, 'HANDED_OVER', ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)
      `,
      [
        productionId,
        orderId,
        totalQuantity,
        userId,
        userId,
        userId,
      ]
    );

    await connection.query(
      `
        UPDATE orders
        SET
          status = 'HANDED_OVER',
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
      status: "HANDED_OVER",
      created: true,
      message:
        "All products passed Quality Control. The packed order goes to the Store.",
    };
  } finally {
    if (own) {
      connection.release();
    }
  }
}


/*
  After Quality Control: 4 steps.
    1. QC passes the order      -> HANDED_OVER  (packed, on its way to the Store; createFinishedGood above)
    2. Store receives it        -> IN_STORE     product stock +qty          (receive)
    3. Marketing makes the bill -> BILLED                                   (createBill)
       and collects the money   (addPayment; when the bill is fully paid the Store hears it)
    4. Store gives it out       -> DELIVERED    product stock -qty, order COMPLETED (dispatch, only once fully paid)
  Each step has ONE owner role (the route checks it, see finished-goods.routes.js) and tells the next owner.
*/
const STEPS = {
  receive:  { from: "HANDED_OVER", to: "IN_STORE",  stamps: ["received"],
              next: "MARKETING_MANAGER", title: (n) => `Order ${n} is in the Store`, body: "It is ready for billing." },
  // giving it out is also the delivery: one click completes the order
  dispatch: { from: "BILLED",      to: "DELIVERED", stamps: ["dispatched", "delivered"], note: "dispatch_note",
              next: "MARKETING_MANAGER", title: (n) => `Order ${n} is given out for delivery`, body: "The order is complete." },
};

// what each finished-goods status means for the whole order (DELIVERED completes it)
const ORDER_STATUS_OF = { HANDED_OVER: "HANDED_OVER", IN_STORE: "IN_STORE", BILLED: "BILLED", DELIVERED: "COMPLETED" };

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

async function tell(conn, { to, next, title, body, important = false, severity = null }, record, userId) {
  const orderNumber = record.order_number || `#${record.order_id}`;
  await notifications.notify(conn, {
    role: next,
    type: `FINISHED_GOODS_${to}`,
    title: title(orderNumber),
    body,
    severity: severity || (to === "DELIVERED" ? "success" : "action"),
    link: "/finished-goods",
    orderId: record.order_id,
    payload: { order_number: orderNumber, finished_goods_id: record.id, status: to },
    userId,
    important,
  });
}

/* receive, dispatch: one call per step. body.note is saved by dispatch. */
async function advance(stepName, id, body = {}, userId = null) {
  const step = STEPS[stepName];
  const note = step.note ? cleanText(body.note) : null;

  return inTransaction(async (conn) => {
    const record = await lockRecord(conn, id, step.from);

    // nothing leaves the Store before the whole bill is paid
    if (stepName === "dispatch") {
      const bill = await lockActiveBill(conn, id);
      if (bill.due > 0) {
        throw new AppError(409, `₹${bill.due} is still due on bill ${bill.bill_number}. Give the goods out only after the full payment.`, "PAYMENT_DUE");
      }
    }

    if (stepName === "receive" || stepName === "dispatch") {
      const receiving = stepName === "receive";
      await productStock.post(conn, await orderLines(conn, record.order_id), {
        direction: receiving ? "IN" : "OUT",
        reason: receiving
          ? `Received after QC pass, order ${record.order_number}`
          : `Given out for delivery, order ${record.order_number}${note ? ` (${note})` : ""}`,
        finishedGoodsId: record.id,
        orderId: record.order_id,
        userId,
      });
    }

    // each stamp X sets X_at / X_by
    const set = step.stamps.map((x) => `, ${x}_at = CURRENT_TIMESTAMP, ${x}_by = ?`).join("") + (step.note ? `, ${step.note} = ?` : "");
    const who = step.stamps.map(() => userId);
    await moveTo(conn, record, step.to, set, step.note ? [...who, note] : who);
    await tell(conn, step, record, userId);

    return { success: true, finishedGoodsId: id, status: step.to };
  });
}

/* ---------------------------------------------------------------- billing (Marketing) */

const money = (cents) => Number((cents / 100).toFixed(2));
const toCents = (v) => Math.round(Number(v) * 100);
const PAYMENT_METHODS = ["CASH", "BANK", "UPI", "CHEQUE", "OTHER"];

/*
  body (everything optional): { items?: [{ product_id, rate, note? }], customer_id?, customer_name?, customer_address?,
                                customer_gstin?, notes? }
  The simple bill is just {}: the customer is the order's own (name and address from Customers) and every product is
  billed at the rate agreed on the order (rate lock), else at its price list. There is no GST: the total is rate x quantity.
  A rate sent for a product changes it; a rate BELOW the list price is a discount and needs a reason (note), which an
  agreed rate brings from the order. A product with no agreed rate and no price in the list must be sent with a rate.
*/
function parseBill(body) {
  const customerName = cleanText(body.customer_name, 150);
  const customerId = body.customer_id === undefined || body.customer_id === null || body.customer_id === "" ? null : Number(body.customer_id);
  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) throw new AppError(422, "The customer is invalid", "VALIDATION");
  if (body.items !== undefined && !Array.isArray(body.items)) throw new AppError(422, "Products are invalid", "VALIDATION");
  const rates = new Map();
  for (const item of body.items || []) {
    const productId = Number(item.product_id);
    const rate = Number(item.rate);
    if (!Number.isInteger(productId) || productId <= 0) throw new AppError(422, "A product is invalid", "VALIDATION");
    if (item.rate === "" || item.rate === null || item.rate === undefined || !Number.isFinite(rate) || rate < 0) {
      throw new AppError(422, "Rate must be zero or more", "VALIDATION");
    }
    rates.set(productId, { cents: toCents(rate), note: cleanText(item.note) });
  }
  return {
    customerId,
    customerName,
    customerAddress: cleanText(body.customer_address, 500),
    customerGstin: cleanText(body.customer_gstin, 20),
    notes: cleanText(body.notes, 500),
    rates,
  };
}

async function nextNumber(conn, table, column, prefix) {
  const year = new Date().getFullYear();
  const [[last]] = await conn.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(${column}, '-', -1) AS UNSIGNED)), 0) AS n
     FROM ${table} WHERE ${column} LIKE ? FOR UPDATE`,
    [`${prefix}-${year}-%`]
  );
  return `${prefix}-${year}-${String(Number(last.n) + 1).padStart(4, "0")}`;
}

async function createBill(id, body = {}, userId = null) {
  const bill = parseBill(body);

  return inTransaction(async (conn) => {
    const record = await lockRecord(conn, id, "IN_STORE");
    if (bill.customerId) {
      const [found] = await conn.query("SELECT id FROM customers WHERE id = ?", [bill.customerId]);
      if (!found.length) throw new AppError(422, "The selected customer no longer exists", "VALIDATION");
    }
    // the customer of the bill: the order's own, unless one was sent (an order from before customers were required)
    if (!bill.customerName && !bill.customerId) {
      const [[c]] = await conn.query(
        `SELECT c.id, c.name, c.address, c.gstin FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
        [record.order_id]
      );
      if (!c || !c.id) throw new AppError(422, "This order has no customer: enter the customer name", "CUSTOMER_REQUIRED");
      Object.assign(bill, { customerId: c.id, customerName: c.name, customerAddress: c.address || null, customerGstin: c.gstin || null });
    } else if (!bill.customerName) {
      const [[c]] = await conn.query("SELECT name, address, gstin FROM customers WHERE id = ?", [bill.customerId]);
      if (!c) throw new AppError(422, "The selected customer no longer exists", "VALIDATION");
      Object.assign(bill, { customerName: c.name, customerAddress: bill.customerAddress || c.address || null, customerGstin: bill.customerGstin || c.gstin || null });
    }
    const lines = await orderLines(conn, record.order_id);
    if ([...bill.rates.keys()].some((productId) => !lines.some((l) => l.productId === productId))) {
      throw new AppError(422, "A product is not part of this order", "VALIDATION");
    }
    const [prices] = await conn.query(
      `SELECT id, name, selling_price, gst_percent FROM products WHERE id IN (?)`,
      [lines.map((l) => l.productId)]
    );
    const priceOf = new Map(prices.map((p) => [Number(p.id), p]));
    // the rates agreed with the customer on the order (rate lock), with the reason when below the price list
    const [agreedRows] = await conn.query(
      `SELECT product_id, MAX(agreed_rate) AS rate, MAX(agreed_note) AS note FROM order_items WHERE order_id = ? AND agreed_rate IS NOT NULL GROUP BY product_id`,
      [record.order_id]
    );
    const agreedOf = new Map(agreedRows.map((a) => [Number(a.product_id), { cents: toCents(a.rate), note: a.note || `Rate agreed on order ${record.order_number}` }]));

    const items = lines.map((l) => {
      const product = priceOf.get(l.productId);
      const listPrice = product.selling_price === null ? null : toCents(product.selling_price);
      const agreed = agreedOf.get(l.productId) || null;
      // no rate sent: the rate agreed on the order, else the price list
      if (!bill.rates.has(l.productId) && !agreed && listPrice === null) {
        throw new AppError(422, `${product.name} has no price in the price list yet: enter its rate (or ask the Super Admin to set the price)`, "PRICE_REQUIRED");
      }
      const sent = bill.rates.get(l.productId);
      let { cents: rate, note } = sent || (agreed && { ...agreed, note: null }) || { cents: listPrice, note: null };
      // an agreed discount already has its reason (written on the order): the bill keeps it
      const discount = listPrice !== null && rate < listPrice;
      if (agreed && rate === agreed.cents && discount && (!note || note.length < 3)) note = agreed.note;
      if (discount && (!note || note.length < 3)) {
        throw new AppError(422, `${product.name}: the rate is below the price list (₹${money(listPrice)}). Write the reason for the discount.`, "DISCOUNT_REASON_REQUIRED");
      }
      const amount = rate * l.quantity;
      const gstBp = 0; // no GST: the bill is rate x quantity
      return { ...l, rate, listPrice, note, amount, gstPercent: gstBp / 100, gst: Math.round((amount * gstBp) / 10000) };
    });
    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    const gstAmount = items.reduce((sum, i) => sum + i.gst, 0);
    // a bill with products at different GST rates keeps the overall rate it works out to
    const gstPercent = subtotal > 0 ? Number(((gstAmount / subtotal) * 100).toFixed(2)) : items[0]?.gstPercent || 0;

    const billNumber = await nextNumber(conn, "bills", "bill_number", "BILL");
    const [result] = await conn.query(
      `INSERT INTO bills (bill_number, finished_goods_id, order_id, customer_id, customer_name, customer_address, customer_gstin,
                          gst_percent, subtotal, gst_amount, total, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [billNumber, record.id, record.order_id, bill.customerId, bill.customerName, bill.customerAddress, bill.customerGstin,
        gstPercent, money(subtotal), money(gstAmount), money(subtotal + gstAmount), bill.notes, userId]
    );
    for (const item of items) {
      await conn.query(
        `INSERT INTO bill_items (bill_id, product_id, quantity, rate, list_price, amount, gst_percent, gst_amount, price_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, item.productId, item.quantity, money(item.rate), item.listPrice === null ? null : money(item.listPrice),
          money(item.amount), item.gstPercent, money(item.gst), item.note]
      );
    }

    await moveTo(conn, record, "BILLED");
    // a bill of 0 is paid already; any other waits for the money (addPayment tells the Store when it is all in)
    const paid = subtotal + gstAmount === 0;
    await tell(conn, {
      to: "BILLED",
      next: "STORE_MANAGER",
      title: (n) => `Order ${n} is billed`,
      body: `Bill ${billNumber}. ${paid ? "Give the goods out for delivery." : "Keep the goods until the full payment is received."}${items.some((i) => i.note) ? " (Billed below the price list.)" : ""}`,
      severity: paid ? null : "info",
      // a bill below the price list is the CEO's business
      important: items.some((i) => i.listPrice !== null && i.rate < i.listPrice),
    }, record, userId);

    return { success: true, finishedGoodsId: id, status: "BILLED", billId: result.insertId, billNumber };
  });
}

/* the ACTIVE bill of a finished-goods record, locked, with what was paid and credited */
async function lockActiveBill(conn, id) {
  const [rows] = await conn.query(
    `SELECT b.*, o.order_number, fg.status AS fg_status
     FROM bills b JOIN orders o ON o.id = b.order_id JOIN finished_goods fg ON fg.id = b.finished_goods_id
     WHERE b.finished_goods_id = ? AND b.status = 'ACTIVE' FOR UPDATE`,
    [id]
  );
  if (!rows.length) throw new AppError(404, "No bill has been made for this order yet", "NOT_FOUND");
  const [[sums]] = await conn.query(
    `SELECT (SELECT COALESCE(SUM(amount), 0) FROM bill_payments WHERE bill_id = ?) AS paid,
            (SELECT COALESCE(SUM(amount), 0) FROM bill_credit_notes WHERE bill_id = ?) AS credited`,
    [rows[0].id, rows[0].id]
  );
  return { ...rows[0], ...billMoney({ total: Number(rows[0].total), paid: Number(sums.paid), credited: Number(sums.credited) }) };
}

/*
  Marketing / Super Admin: the bill is paid, IN FULL, in one go (no part payments). body: { method, reference?,
  amount?, paid_on? }. The amount is the whole amount due (an amount sent must be exactly that); the date is today
  unless another is sent.
*/
async function addPayment(id, body = {}, userId = null) {
  const method = String(body.method || "").toUpperCase();
  if (!PAYMENT_METHODS.includes(method)) throw new AppError(422, "Choose how it was paid", "VALIDATION");
  const paidOn = body.paid_on ? String(body.paid_on) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new AppError(422, "The payment date is invalid", "VALIDATION");

  return inTransaction(async (conn) => {
    const bill = await lockActiveBill(conn, id);
    if (toCents(bill.due) <= 0) throw new AppError(409, "This bill is already paid", "ALREADY_PAID");
    const amount = Number(bill.due);
    if (body.amount !== undefined && body.amount !== null && body.amount !== "" && toCents(body.amount) !== toCents(amount)) {
      throw new AppError(422, `The bill is paid in full in one go: ₹${bill.due}`, "PAY_IN_FULL");
    }
    await conn.query(
      `INSERT INTO bill_payments (bill_id, amount, paid_on, method, reference, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [bill.id, amount, paidOn, method, cleanText(body.reference, 100), userId]
    );
    const dueAfter = money(toCents(bill.due) - toCents(amount));
    // the last of the money is in: now the Store may give the goods out
    if (dueAfter === 0 && bill.fg_status === "BILLED") {
      await tell(conn, {
        to: "PAID",
        next: "STORE_MANAGER",
        title: (n) => `Order ${n} is fully paid`,
        body: `Bill ${bill.bill_number} is paid. Give the goods out for delivery.`,
      }, { id, order_id: bill.order_id, order_number: bill.order_number }, userId);
    }
    return { success: true, billNumber: bill.bill_number, due: dueAfter };
  });
}

/*
  Super Admin: cancel the bill while the goods are still in the Store (BILLED) and nothing was paid. The bill is kept
  as CANCELLED with the reason; the order goes back to IN_STORE so Marketing can bill it again.
*/
async function cancelBill(id, body = {}, userId = null) {
  const reason = cleanText(body.reason);
  if (!reason || reason.length < 5) throw new AppError(422, "Write why the bill is cancelled (at least 5 characters)", "VALIDATION");

  return inTransaction(async (conn) => {
    const bill = await lockActiveBill(conn, id);
    if (bill.fg_status !== "BILLED") {
      throw new AppError(409, "The goods have already left the Store: make a credit note instead", "GOODS_LEFT");
    }
    if (bill.paid > 0) throw new AppError(409, "Money was already received on this bill: make a credit note instead", "BILL_PAID");
    await conn.query(
      `UPDATE bills SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP, cancel_reason = ? WHERE id = ?`,
      [userId, reason, bill.id]
    );
    const record = await lockRecord(conn, id, "BILLED");
    await moveTo(conn, record, "IN_STORE");
    await tell(conn, {
      to: "IN_STORE",
      next: "MARKETING_MANAGER",
      title: (n) => `Bill ${bill.bill_number} of order ${n} was cancelled`,
      body: `Reason: ${reason}. Make the bill again.`,
    }, record, userId);
    await notifications.notify(conn, {
      role: "STORE_MANAGER", type: "BILL_CANCELLED", severity: "warning", link: "/finished-goods",
      title: `Bill ${bill.bill_number} was cancelled: keep the goods`, body: `Order ${record.order_number} waits for a new bill.`,
      orderId: record.order_id, payload: { bill_number: bill.bill_number }, userId,
    });
    return { success: true, billNumber: bill.bill_number, status: "IN_STORE" };
  });
}

/* Super Admin: reduce the bill after the goods left (return, damage, wrong rate). body: { amount, reason } */
async function addCreditNote(id, body = {}, userId = null) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    throw new AppError(422, "Amount must be more than 0, with at most 2 decimals", "VALIDATION");
  }
  const reason = cleanText(body.reason);
  if (!reason || reason.length < 5) throw new AppError(422, "Write why the bill is reduced (at least 5 characters)", "VALIDATION");

  return inTransaction(async (conn) => {
    const bill = await lockActiveBill(conn, id);
    if (bill.fg_status === "BILLED") {
      throw new AppError(409, "The goods are still in the Store: cancel the bill instead", "GOODS_IN_STORE");
    }
    if (toCents(amount) > toCents(bill.net)) {
      throw new AppError(409, `The credit cannot be more than the bill's ₹${bill.net}`, "MORE_THAN_BILL");
    }
    const creditNumber = await nextNumber(conn, "bill_credit_notes", "credit_number", "CN");
    await conn.query(
      `INSERT INTO bill_credit_notes (credit_number, bill_id, amount, reason, created_by) VALUES (?, ?, ?, ?, ?)`,
      [creditNumber, bill.id, amount, reason, userId]
    );
    await notifications.notify(conn, {
      role: "MARKETING_MANAGER", type: "CREDIT_NOTE", severity: "warning", link: "/finished-goods",
      title: `Credit note ${creditNumber} on bill ${bill.bill_number}`, body: `₹${amount} less. Reason: ${reason}`,
      orderId: bill.order_id, payload: { bill_number: bill.bill_number, credit_number: creditNumber }, userId,
    });
    return { success: true, creditNumber, billNumber: bill.bill_number };
  });
}

async function getBill(id) {
  const [bills] = await db.query(
    `SELECT b.*, o.order_number, u.name AS created_by_name, fg.status AS fg_status
     FROM bills b JOIN orders o ON o.id = b.order_id JOIN finished_goods fg ON fg.id = b.finished_goods_id
     LEFT JOIN users u ON u.id = b.created_by
     WHERE b.finished_goods_id = ? AND b.status = 'ACTIVE'`,
    [id]
  );
  if (!bills.length) throw new AppError(404, "No bill has been made for this order yet");
  const b = bills[0];
  const [items] = await db.query(
    `SELECT bi.product_id, p.sku, p.name, bi.quantity, bi.rate, bi.list_price, bi.amount, bi.gst_percent, bi.gst_amount, bi.price_note
     FROM bill_items bi JOIN products p ON p.id = bi.product_id WHERE bi.bill_id = ? ORDER BY bi.id`,
    [b.id]
  );
  const [payments] = await db.query(
    `SELECT bp.id, bp.amount, DATE_FORMAT(bp.paid_on, '%Y-%m-%d') AS paid_on, bp.method, bp.reference, bp.created_at, u.name AS by_name
     FROM bill_payments bp LEFT JOIN users u ON u.id = bp.created_by WHERE bp.bill_id = ? ORDER BY bp.paid_on, bp.id`,
    [b.id]
  );
  const [credits] = await db.query(
    `SELECT cn.id, cn.credit_number, cn.amount, cn.reason, cn.created_at, u.name AS by_name
     FROM bill_credit_notes cn LEFT JOIN users u ON u.id = cn.created_by WHERE cn.bill_id = ? ORDER BY cn.id`,
    [b.id]
  );
  const [cancelled] = await db.query(
    `SELECT b.bill_number, b.total, b.cancel_reason, b.cancelled_at, u.name AS by_name
     FROM bills b LEFT JOIN users u ON u.id = b.cancelled_by WHERE b.finished_goods_id = ? AND b.status = 'CANCELLED' ORDER BY b.id`,
    [id]
  );
  const paid = payments.reduce((sum, x) => sum + Number(x.amount), 0);
  const credited = credits.reduce((sum, x) => sum + Number(x.amount), 0);
  return {
    id: b.id,
    billNumber: b.bill_number,
    orderNumber: b.order_number,
    goodsStatus: b.fg_status,
    customerName: b.customer_name,
    customerAddress: b.customer_address,
    customerGstin: b.customer_gstin,
    subtotal: Number(b.subtotal),
    gstAmount: Number(b.gst_amount),
    notes: b.notes,
    createdAt: b.created_at,
    createdByName: b.created_by_name,
    ...billMoney({ total: Number(b.total), paid, credited }),
    items: items.map((i) => ({
      productId: i.product_id, sku: i.sku, name: i.name, quantity: Number(i.quantity), rate: Number(i.rate),
      listPrice: i.list_price === null ? null : Number(i.list_price), amount: Number(i.amount),
      gstPercent: Number(i.gst_percent), gstAmount: Number(i.gst_amount), priceNote: i.price_note,
    })),
    payments: payments.map((x) => ({ id: x.id, amount: Number(x.amount), paidOn: x.paid_on, method: x.method, reference: x.reference, byName: x.by_name })),
    creditNotes: credits.map((x) => ({ id: x.id, number: x.credit_number, amount: Number(x.amount), reason: x.reason, at: x.created_at, byName: x.by_name })),
    cancelledBills: cancelled.map((x) => ({ number: x.bill_number, total: Number(x.total), reason: x.cancel_reason, at: x.cancelled_at, byName: x.by_name })),
  };
}

module.exports = {
  getFinishedGoods,
  getFinishedGood,
  createFinishedGood,
  advance,
  createBill,
  getBill,
  addPayment,
  cancelBill,
  addCreditNote,
  PAYMENT_METHODS,
};

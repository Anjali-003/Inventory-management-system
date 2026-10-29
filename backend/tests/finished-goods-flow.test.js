/**
 * After QC (modules/finished-goods/finished-goods.service.js): each step needs the status before it, moves the
 * order along, product stock goes up on receive and down on dispatch, and the bill adds up.
 * MySQL is replaced by a small in-memory fake that understands only the queries these steps send.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let s;

const fresh = () => ({
  fg: { id: 5, order_id: 12, status: "HANDED_OVER" }, // QC passed: packed and sent to the Store
  order: { id: 12, order_number: "ORD-012", status: "HANDED_OVER" },
  lines: [{ product_id: 1, quantity: 5 }, { product_id: 2, quantity: 3 }],
  stock: new Map([[1, 0], [2, 1]]),
  ledger: [],
  bills: [],
  billItems: [],
  notifications: [],
  // price list: product 1 has a price (100), product 2 none yet; GST differs per product
  products: [{ id: 1, name: "Fan", selling_price: "100.00", gst_percent: "18.00" }, { id: 2, name: "Bulb", selling_price: null, gst_percent: "12.00" }],
  payments: [],
  credits: [],
  // the customer the order is for (a bill is made out to them unless another is sent)
  orderCustomer: { id: 7, name: "Sharma Traders", address: "Pune", gstin: null },
});

const norm = (sql) => sql.replace(/\s+/g, " ").trim();
function run(raw, p = []) {
  const sql = norm(raw);
  if (sql.includes("FROM finished_goods fg JOIN orders o ON o.id = fg.order_id WHERE fg.id = ? FOR UPDATE")) {
    return [s.fg.id === p[0] ? [{ ...s.fg, order_number: s.order.order_number }] : []];
  }
  if (sql.startsWith("SELECT product_id, CAST(SUM(quantity) AS SIGNED) AS quantity FROM order_items")) return [s.lines];
  if (sql.startsWith("INSERT INTO product_stock (")) { if (!s.stock.has(p[0])) s.stock.set(p[0], 0); return [{}]; }
  if (sql.includes("FROM product_stock ps JOIN products p")) {
    return [p[0].map((id) => ({ product_id: id, quantity_on_hand: s.stock.get(id), name: `P${id}` }))];
  }
  if (sql.startsWith("UPDATE product_stock SET quantity_on_hand")) { s.stock.set(p[1], p[0]); return [{}]; }
  if (sql.startsWith("INSERT INTO product_stock_transactions")) { s.ledger.push({ product_id: p[0], direction: p[1], quantity: p[2] }); return [{}]; }
  if (sql.startsWith("UPDATE finished_goods SET status = ?")) { s.fg.status = p[0]; return [{ affectedRows: 1 }]; }
  if (sql.startsWith("UPDATE orders SET status = ?")) { s.order.status = p[0]; return [{ affectedRows: 1 }]; }
  if (sql.startsWith("INSERT INTO notifications")) { s.notifications.push({ role: p[0], type: p[1] }); return [{ insertId: s.notifications.length }]; }
  if (sql.includes("FROM bills WHERE bill_number LIKE ? FOR UPDATE")) return [[{ n: s.bills.length }]];
  if (sql.startsWith("INSERT INTO bills")) { s.bills.push(p); return [{ insertId: s.bills.length }]; }
  if (sql.startsWith("INSERT INTO bill_items")) { s.billItems.push(p); return [{}]; }
  if (sql.startsWith("SELECT id FROM customers WHERE id = ?")) return [[{ id: p[0] }]];
  if (sql.startsWith("SELECT c.id, c.name, c.address, c.gstin FROM orders o LEFT JOIN customers c")) return [[s.orderCustomer]];
  if (sql.startsWith("SELECT id, name, selling_price, gst_percent FROM products WHERE id IN (?)")) return [s.products.filter((x) => p[0].includes(x.id))];
  // rates agreed on the order (rate lock): none here, the bill uses the price list (covered in tests/mysql/rate-lock)
  if (sql.startsWith("SELECT product_id, MAX(agreed_rate) AS rate")) return [[]];
  if (sql.includes("FROM bills b JOIN orders o ON o.id = b.order_id JOIN finished_goods fg") && sql.includes("FOR UPDATE")) {
    const bill = s.bills.length ? { id: 1, bill_number: "BILL-2026-0001", order_id: s.order.id, order_number: s.order.order_number, total: s.bills[0][10], fg_status: s.fg.status } : null;
    return [bill ? [bill] : []];
  }
  if (sql.startsWith("SELECT (SELECT COALESCE(SUM(amount), 0) FROM bill_payments")) {
    return [[{ paid: s.payments.reduce((a, x) => a + x, 0), credited: s.credits.reduce((a, x) => a + x, 0) }]];
  }
  if (sql.startsWith("INSERT INTO bill_payments")) { s.payments.push(Number(p[1])); return [{}]; }
  if (sql.includes("FROM bill_credit_notes WHERE credit_number LIKE ? FOR UPDATE")) return [[{ n: s.credits.length }]];
  if (sql.startsWith("INSERT INTO bill_credit_notes")) { s.credits.push(Number(p[2])); return [{}]; }
  if (sql.startsWith("UPDATE bills SET status = 'CANCELLED'")) { s.billCancelled = true; return [{}]; }
  throw new Error(`fake db: unexpected SQL: ${sql}`);
}

const conn = { query: async (sql, p) => run(sql, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: { query: conn.query, getConnection: async () => conn } };
// live push / web push are not part of this test
require.cache[require.resolve("../src/realtime/hub.js")] = { id: "hub", filename: "hub", loaded: true, exports: { notifyRole: () => {}, broadcast: () => {} } };
require.cache[require.resolve("../src/modules/push/push.service.js")] = { id: "push", filename: "push", loaded: true, exports: { sendToRole: () => {} } };
const fg = require("../src/modules/finished-goods/finished-goods.service.js");

beforeEach(() => { s = fresh(); });

const BILL = { customer_name: "ABC Traders", items: [{ product_id: 1, rate: 100 }, { product_id: 2, rate: 250.5 }] };
const PAY = (amount) => ({ amount, paid_on: "2026-10-26", method: "UPI" });
// the order in the Store, billed (total 1251.50, no GST) and paid in full: ready to give out
const billedAndPaid = async () => {
  s.fg.status = "IN_STORE";
  await fg.createBill(5, BILL, 1);
  await fg.addPayment(5, PAY(1251.5), 1);
};

describe("finished goods after QC", () => {
  it("runs the 3 steps after QC in order, each telling the next owner; giving out completes the order", async () => {
    await fg.advance("receive", 5, {}, 1);
    expect([s.fg.status, s.order.status]).toEqual(["IN_STORE", "IN_STORE"]);
    await fg.createBill(5, BILL, 1);
    expect(s.fg.status).toBe("BILLED");
    await fg.addPayment(5, PAY(1251.5), 1);
    await fg.advance("dispatch", 5, { note: "Truck 1" }, 1);
    expect([s.fg.status, s.order.status]).toEqual(["DELIVERED", "COMPLETED"]);
    expect(s.notifications.map((n) => `${n.role} ${n.type}`)).toEqual([
      "MARKETING_MANAGER FINISHED_GOODS_IN_STORE",
      "STORE_MANAGER FINISHED_GOODS_BILLED", // keep the goods: not paid yet
      "STORE_MANAGER FINISHED_GOODS_PAID", // the full payment is in: give them out
      "MARKETING_MANAGER FINISHED_GOODS_DELIVERED",
    ]);
  });

  it("gives nothing out before the bill is paid", async () => {
    s.fg.status = "IN_STORE";
    await fg.createBill(5, BILL, 1);
    await expect(fg.advance("dispatch", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "PAYMENT_DUE" });
    await expect(fg.addPayment(5, PAY(1000), 1)).rejects.toMatchObject({ code: "PAY_IN_FULL" }); // no part payments
    await expect(fg.advance("dispatch", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "PAYMENT_DUE" });
    expect([s.fg.status, s.ledger.length, s.payments]).toEqual(["BILLED", 0, []]);
    expect(s.notifications.filter((n) => n.type === "FINISHED_GOODS_PAID")).toHaveLength(0);
    await fg.addPayment(5, { method: "UPI" }, 1);
    expect(s.notifications.filter((n) => n.type === "FINISHED_GOODS_PAID")).toHaveLength(1);
    s.stock = new Map([[1, 5], [2, 3]]);
    await fg.advance("dispatch", 5, {}, 1);
    expect(s.fg.status).toBe("DELIVERED");
  });

  it("refuses a step whose turn has not come (or is already done)", async () => {
    await expect(fg.advance("dispatch", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "WRONG_STATUS" });
    await fg.advance("receive", 5, {}, 1);
    await expect(fg.advance("receive", 5, {}, 1)).rejects.toMatchObject({ status: 409 });
    expect(s.fg.status).toBe("IN_STORE");
  });

  it("puts every product into stock on receive and takes it out on dispatch", async () => {
    s.fg.status = "HANDED_OVER";
    await fg.advance("receive", 5, {}, 1);
    expect([s.stock.get(1), s.stock.get(2)]).toEqual([5, 4]);
    await billedAndPaid();
    await fg.advance("dispatch", 5, {}, 1);
    expect([s.stock.get(1), s.stock.get(2)]).toEqual([0, 1]);
    expect(s.ledger.map((l) => `${l.direction}${l.quantity}`)).toEqual(["IN5", "IN3", "OUT5", "OUT3"]);
  });

  it("never lets product stock go below zero", async () => {
    await billedAndPaid();
    await expect(fg.advance("dispatch", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK" });
  });

  it("adds the bill up: rate x quantity per product, no GST", async () => {
    s.fg.status = "IN_STORE";
    const res = await fg.createBill(5, BILL, 1);
    expect(res.billNumber).toMatch(/^BILL-\d{4}-0001$/);
    const [, , , customerId, name, , , , subtotal, gstAmount, total] = s.bills[0];
    // 5 x 100 + 3 x 250.50 = 1251.50, and that is the total
    expect({ customerId, name, subtotal, gstAmount, total }).toEqual({ customerId: null, name: "ABC Traders", subtotal: 1251.5, gstAmount: 0, total: 1251.5 });
  });

  it("a rate below the price list needs the reason for the discount", async () => {
    s.fg.status = "IN_STORE";
    const cheap = { ...BILL, items: [{ product_id: 1, rate: 90 }, { product_id: 2, rate: 250.5 }] };
    await expect(fg.createBill(5, cheap, 1)).rejects.toMatchObject({ code: "DISCOUNT_REASON_REQUIRED" });
    await fg.createBill(5, { ...cheap, items: [{ product_id: 1, rate: 90, note: "bulk order" }, { product_id: 2, rate: 250.5 }] }, 1);
    expect(s.fg.status).toBe("BILLED");
  });

  it("is paid in full, in one go: only how is asked", async () => {
    s.fg.status = "IN_STORE";
    await fg.createBill(5, BILL, 1);
    await expect(fg.addPayment(5, {}, 1)).rejects.toMatchObject({ status: 422 }); // how was it paid?
    await expect(fg.addPayment(5, PAY(431.68), 1)).rejects.toMatchObject({ code: "PAY_IN_FULL" });
    const res = await fg.addPayment(5, { method: "CASH" }, 1);
    expect([res.due, s.payments]).toEqual([0, [1251.5]]);
    await expect(fg.addPayment(5, { method: "UPI" }, 1)).rejects.toMatchObject({ code: "ALREADY_PAID" });
  });

  it("cancels a bill only while the goods are in the Store; after that it is a credit note", async () => {
    s.fg.status = "IN_STORE";
    await fg.createBill(5, BILL, 1);
    await expect(fg.addCreditNote(5, { amount: 100, reason: "2 returned" }, 1)).rejects.toMatchObject({ code: "GOODS_IN_STORE" });
    await fg.cancelBill(5, { reason: "wrong customer" }, 1);
    expect([s.billCancelled, s.fg.status]).toEqual([true, "IN_STORE"]);

    s = fresh();
    s.fg.status = "IN_STORE";
    await fg.createBill(5, BILL, 1);
    s.fg.status = "DELIVERED";
    await expect(fg.cancelBill(5, { reason: "wrong customer" }, 1)).rejects.toMatchObject({ code: "GOODS_LEFT" });
    const cn = await fg.addCreditNote(5, { amount: 100, reason: "1 piece returned damaged" }, 1);
    expect(cn.creditNumber).toMatch(/^CN-\d{4}-0001$/);
    await expect(fg.addCreditNote(5, { amount: 5000, reason: "too much" }, 1)).rejects.toMatchObject({ code: "MORE_THAN_BILL" });
  });

  it("bills the order's customer at the price list; only a product with no price needs its rate", async () => {
    s.fg.status = "IN_STORE";
    // the bulb has no price in the list
    await expect(fg.createBill(5, {}, 1)).rejects.toMatchObject({ status: 422, code: "PRICE_REQUIRED" });
    expect(s.fg.status).toBe("IN_STORE");

    await fg.createBill(5, { items: [{ product_id: 2, rate: 250.5 }] }, 1);
    const [, , , customerId, customerName, customerAddress] = s.bills[0];
    expect([customerId, customerName, customerAddress]).toEqual([7, "Sharma Traders", "Pune"]);
    expect(s.billItems.map((i) => [i[1], i[3]])).toEqual([[1, 100], [2, 250.5]]); // the fan at its list price
  });

  it("an order without a customer (from before customers were required) asks for one", async () => {
    s.fg.status = "IN_STORE";
    s.orderCustomer = { id: null, name: null };
    await expect(fg.createBill(5, { items: [{ product_id: 2, rate: 250.5 }] }, 1)).rejects.toMatchObject({ code: "CUSTOMER_REQUIRED" });
    await fg.createBill(5, { customer_name: "ABC Traders", items: [{ product_id: 2, rate: 250.5 }] }, 1);
    expect(s.bills[0][4]).toBe("ABC Traders");
  });
});

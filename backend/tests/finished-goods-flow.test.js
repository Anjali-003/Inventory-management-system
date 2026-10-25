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
  fg: { id: 5, order_id: 12, status: "PACKAGING" },
  order: { id: 12, order_number: "ORD-012", status: "PACKAGING" },
  lines: [{ product_id: 1, quantity: 5 }, { product_id: 2, quantity: 3 }],
  stock: new Map([[1, 0], [2, 1]]),
  ledger: [],
  bills: [],
  billItems: [],
  notifications: [],
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
  throw new Error(`fake db: unexpected SQL: ${sql}`);
}

const conn = { query: async (sql, p) => run(sql, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: { query: conn.query, getConnection: async () => conn } };
// live push / web push are not part of this test
require.cache[require.resolve("../src/realtime/hub.js")] = { id: "hub", filename: "hub", loaded: true, exports: { notifyRole: () => {}, broadcast: () => {} } };
require.cache[require.resolve("../src/modules/push/push.service.js")] = { id: "push", filename: "push", loaded: true, exports: { sendToRole: () => {} } };
const fg = require("../src/modules/finished-goods/finished-goods.service.js");

beforeEach(() => { s = fresh(); });

const BILL = { customer_name: "ABC Traders", gst_percent: 18, items: [{ product_id: 1, rate: 100 }, { product_id: 2, rate: 250.5 }] };

describe("finished goods after QC", () => {
  it("runs every step in order, each telling the next owner", async () => {
    await fg.advance("pack", 5, {}, 1);
    expect([s.fg.status, s.order.status]).toEqual(["PACKED", "PACKED"]);
    await fg.advance("handOver", 5, {}, 1);
    await fg.advance("receive", 5, {}, 1);
    expect(s.fg.status).toBe("IN_STORE");
    await fg.createBill(5, BILL, 1);
    expect(s.fg.status).toBe("BILLED");
    await fg.advance("dispatch", 5, { note: "Truck 1" }, 1);
    await fg.advance("deliver", 5, {}, 1);
    expect([s.fg.status, s.order.status]).toEqual(["DELIVERED", "COMPLETED"]);
    expect(s.notifications.map((n) => n.role)).toEqual([
      "OPERATIONS_ADMIN", "STORE_MANAGER", "MARKETING_MANAGER", "STORE_MANAGER", "MARKETING_MANAGER", "OPERATIONS_ADMIN",
    ]);
  });

  it("refuses a step whose turn has not come (or is already done)", async () => {
    await expect(fg.advance("handOver", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "WRONG_STATUS" });
    await fg.advance("pack", 5, {}, 1);
    await expect(fg.advance("pack", 5, {}, 1)).rejects.toMatchObject({ status: 409 });
    expect(s.fg.status).toBe("PACKED");
  });

  it("puts every product into stock on receive and takes it out on dispatch", async () => {
    s.fg.status = "HANDED_OVER";
    await fg.advance("receive", 5, {}, 1);
    expect([s.stock.get(1), s.stock.get(2)]).toEqual([5, 4]);
    s.fg.status = "BILLED";
    await fg.advance("dispatch", 5, {}, 1);
    expect([s.stock.get(1), s.stock.get(2)]).toEqual([0, 1]);
    expect(s.ledger.map((l) => `${l.direction}${l.quantity}`)).toEqual(["IN5", "IN3", "OUT5", "OUT3"]);
  });

  it("never lets product stock go below zero", async () => {
    s.fg.status = "BILLED";
    await expect(fg.advance("dispatch", 5, {}, 1)).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK" });
  });

  it("adds the bill up: rate x quantity per product, then GST", async () => {
    s.fg.status = "IN_STORE";
    const res = await fg.createBill(5, BILL, 1);
    expect(res.billNumber).toMatch(/^BILL-\d{4}-0001$/);
    const [, , , customerId, name, , , gst, subtotal, gstAmount, total] = s.bills[0];
    expect({ customerId, name, gst, subtotal, gstAmount, total }).toEqual({ customerId: null, name: "ABC Traders", gst: 18, subtotal: 1251.5, gstAmount: 225.27, total: 1476.77 });
  });

  it("needs a customer and a rate for every product", async () => {
    s.fg.status = "IN_STORE";
    await expect(fg.createBill(5, { ...BILL, customer_name: "" }, 1)).rejects.toMatchObject({ status: 422 });
    await expect(fg.createBill(5, { ...BILL, items: [{ product_id: 1, rate: 100 }] }, 1)).rejects.toMatchObject({ status: 422 });
    expect(s.fg.status).toBe("IN_STORE");
  });
});

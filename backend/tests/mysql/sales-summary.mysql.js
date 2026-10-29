/**
 * The Marketing dashboard's money (GET /sales/summary) on the real MySQL (a throw-away copy, see helpers/mysqlDb.js):
 *   trend   net sales (bills after credit notes) of the 6 months ending with the month asked, oldest first
 *   owed    each bill still to collect carries the saved customer's phone, for a payment reminder
 *   byProduct  what sold best in the month: units, amount, customers and share, biggest amount first
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("t_salessum"); // before anything from src/

const db = require("../../src/config/db");
const sales = require("../../src/modules/sales/sales.service");

let n = 0;
let fx;
/* a bill of `total` made on `day` ("2026-09-14"), for a saved customer when `customerId` is given */
async function billOn(day, total, { customerId = null, customer = "Walk-in", status = "ACTIVE" } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    const [r] = await conn.query(
      `INSERT INTO bills (bill_number, finished_goods_id, order_id, customer_id, customer_name, gst_percent, subtotal, gst_amount, total, status, created_at)
       VALUES (?, 0, 0, ?, ?, 0, ?, 0, ?, ?, ?)`,
      [`BILL-T-${++n}`, customerId, customer, total, total, status, `${day} 10:00:00`]
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    return r.insertId;
  } finally {
    conn.release();
  }
}

beforeAll(testDb.create, 120_000);
beforeEach(async () => { fx = await testDb.reset(); n = 0; });
afterAll(testDb.drop);

describe("sales summary", () => {
  it("gives the 6 months' net sales ending with the month asked, a month with no bill as 0", async () => {
    await billOn("2026-04-20", 999); // 7 months back: left out
    await billOn("2026-05-02", 1000);
    await billOn("2026-07-31", 2000);
    const credited = await billOn("2026-09-14", 3000);
    await db.query("INSERT INTO bill_credit_notes (credit_number, bill_id, amount, reason, created_at) VALUES ('CN-T-1', ?, 500, 'damaged', '2026-09-20 10:00:00')", [credited]);
    await billOn("2026-10-01", 4000);
    await billOn("2026-10-02", 700, { status: "CANCELLED" }); // a cancelled bill is no sale
    await billOn("2026-11-01", 5000); // after the month asked: left out

    const { trend } = await sales.summary("2026-10");
    expect(trend).toEqual([
      { month: "2026-05", net: 1000 },
      { month: "2026-06", net: 0 },
      { month: "2026-07", net: 2000 },
      { month: "2026-08", net: 0 },
      { month: "2026-09", net: 2500 },
      { month: "2026-10", net: 4000 },
    ]);
  });

  it("crosses the year: the 6 months up to January start in August", async () => {
    const { trend } = await sales.summary("2027-01");
    expect(trend.map((t) => t.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  });

  it("gives each bill still to collect the saved customer's phone", async () => {
    const [c] = await db.query("INSERT INTO customers (name, phone) VALUES ('Phone Traders', '98765 43210')");
    await billOn("2026-09-01", 1200, { customerId: c.insertId, customer: "Phone Traders" });
    await billOn("2026-09-02", 800, { customer: "Typed By Hand" });

    const { owed } = await sales.summary("2026-10");
    expect(owed).toEqual([
      expect.objectContaining({ customer: "Phone Traders", due: 1200, phone: "98765 43210" }),
      expect.objectContaining({ customer: "Typed By Hand", due: 800, phone: null }),
    ]);
  });

  it("ranks the month's products by billed amount, with units, customers and share", async () => {
    const line = (billId, product, quantity, rate) => db.query(
      "INSERT INTO bill_items (bill_id, product_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)", [billId, product, quantity, rate, quantity * rate]);
    const ctrl = fx.products.Controller.id;
    const sens = fx.products.Sensor.id;
    await line(await billOn("2026-10-03", 1000, { customer: "A Traders" }), ctrl, 10, 110);
    const both = await billOn("2026-10-05", 2000, { customer: "B Traders" });
    await line(both, ctrl, 5, 110);
    await line(both, sens, 50, 30);
    await line(await billOn("2026-10-06", 300, { status: "CANCELLED" }), sens, 10, 30); // cancelled: not sold
    await line(await billOn("2026-09-30", 900), sens, 30, 30); // last month

    const { byProduct, margin } = await sales.summary("2026-10");
    // the month: (3150 - 457.50) / 3150; September: (900 - 180) / 900; costed at standard cost, so an estimate
    expect(margin).toEqual({ pct: 85.5, lastPct: 80, estimated: true, uncosted: 0 });
    expect(byProduct).toEqual([
      // parts at their standard cost 1.50: a controller costs 7 x 1.50 = 10.50, a sensor 4 x 1.50 = 6
      { productId: ctrl, name: "Controller", sku: "T-CTRL", units: 15, amount: 1650, customers: 2, share: 52, margin: 90 }, // (1650 - 157.50) / 1650
      { productId: sens, name: "Sensor", sku: "T-SENS", units: 50, amount: 1500, customers: 1, share: 48, margin: 80 }, // (1500 - 300) / 1500
    ]);
  });
});

/**
 * Marketing's rate lock and "going quiet" customers, on the real MySQL (a throw-away copy, see helpers/mysqlDb.js):
 *   marketing-orders createDraft()   keeps the rate agreed per product; a rate below the price list needs its reason
 *   finished-goods createBill()      bills at the agreed rate (not today's price list), the order's reason kept
 *   customers list()                 a customer whose next order is 1.5x its usual gap late is "going quiet"
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("t_ratelock"); // before anything from src/

const db = require("../../src/config/db");
const marketing = require("../../src/sales/marketing-orders/marketing-order.service");
const finishedGoods = require("../../src/production/finished-goods/finished-goods.service");
const customers = require("../../src/sales/customers/customer.service");

let fx;
const one = async (sql, params) => (await db.query(sql, params))[0][0];
const all = async (sql, params) => (await db.query(sql, params))[0];
const mkt = () => fx.users.MARKETING_MANAGER;
const ctrl = () => fx.products.Controller.id;

/* a draft of `quantity` controllers for `customer`, with the given rate fields */
const draft = (rate = {}, quantity = 10, customer = "Rate Traders") =>
  marketing.createDraft({ customer_name: customer, required_by_date: "2099-12-31", items: [{ productId: ctrl(), quantity, ...rate }] }, mkt());

/* the order's goods in the Store, ready to bill (the steps before are covered by their own tests) */
async function inStore(orderId, quantity) {
  const conn = await db.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    const [r] = await conn.query("INSERT INTO finished_goods (production_id, order_id, quantity, status) VALUES (0, ?, ?, 'IN_STORE')", [orderId, quantity]);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    return r.insertId;
  } finally {
    conn.release();
  }
}
const billItem = async (fgId) => one("SELECT bi.rate, bi.list_price, bi.price_note FROM bill_items bi JOIN bills b ON b.id = bi.bill_id WHERE b.finished_goods_id = ?", [fgId]);

beforeAll(testDb.create, 120_000);
beforeEach(async () => {
  fx = await testDb.reset();
  await db.query("UPDATE products SET selling_price = 100 WHERE id = ?", [ctrl()]);
});
afterAll(testDb.drop);

describe("rate agreed on the order", () => {
  it("is kept per product and shown as the order's price, next to the price list", async () => {
    const order = await draft({ rate: 120 });
    expect(order.items[0]).toMatchObject({ price: 120, list_price: 100, agreed_rate: 120 });
    expect(order.totals.value).toBe(1200);
    // no rate: nothing agreed, the order shows the price list
    const plain = await draft({}, 5);
    expect(plain.items[0]).toMatchObject({ price: 100, agreed_rate: null });
  });

  it("needs the reason when it is below the price list, and refuses what is not a rate", async () => {
    await expect(draft({ rate: 90 })).rejects.toMatchObject({ code: "DISCOUNT_REASON_REQUIRED" });
    for (const rate of [-1, "abc", 10.555]) await expect(draft({ rate })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await one("SELECT COUNT(*) AS n FROM orders")).n).toBe(0);

    const order = await draft({ rate: 90, rate_note: "Yearly contract" });
    expect(await one("SELECT agreed_rate, agreed_note FROM order_items WHERE order_id = ?", [order.id])).toEqual({ agreed_rate: "90.00", agreed_note: "Yearly contract" });
  });

  it("is what the bill charges by default, even after the price list changed", async () => {
    const order = await draft({ rate: 90, rate_note: "Yearly contract" });
    await db.query("UPDATE products SET selling_price = 110 WHERE id = ?", [ctrl()]); // the list goes up after the order
    const fg = await inStore(order.id, 10);

    await finishedGoods.createBill(fg, {}, mkt());
    expect(await billItem(fg)).toEqual({ rate: "90.00", list_price: "110.00", price_note: "Yearly contract" });
    expect(Number((await one("SELECT total FROM bills WHERE finished_goods_id = ?", [fg])).total)).toBe(900);
  });

  it("keeps no discount note when the agreed rate is not below the list, and lets the bill change the rate", async () => {
    const order = await draft({ rate: 120 });
    const fg = await inStore(order.id, 10);
    await finishedGoods.createBill(fg, {}, mkt());
    expect(await billItem(fg)).toEqual({ rate: "120.00", list_price: "100.00", price_note: null });

    // a different rate below the list typed on the bill still needs its own reason
    const other = await draft({ rate: 95, rate_note: "Agreed" }, 4, "Other Traders");
    const fg2 = await inStore(other.id, 4);
    await expect(finishedGoods.createBill(fg2, { items: [{ product_id: ctrl(), rate: 80 }] }, mkt())).rejects.toMatchObject({ code: "DISCOUNT_REASON_REQUIRED" });
  });

  it("lets an order with an agreed rate be billed when the product has no price list", async () => {
    await db.query("UPDATE products SET selling_price = NULL WHERE id = ?", [ctrl()]);
    const order = await draft({ rate: 75 });
    const fg = await inStore(order.id, 2);
    await finishedGoods.createBill(fg, {}, mkt());
    expect(await billItem(fg)).toEqual({ rate: "75.00", list_price: null, price_note: null });
  });
});

describe("customers going quiet", () => {
  /* a sent order for `customer`, placed `daysAgo` days ago */
  async function orderedAgo(customer, daysAgo) {
    const o = await draft({}, 1, customer);
    await marketing.send(o.id, mkt());
    await db.query("UPDATE orders SET created_at = NOW() - INTERVAL ? DAY WHERE id = ?", [daysAgo, o.id]);
  }
  const byName = async () => Object.fromEntries((await customers.list()).map((c) => [c.name, c]));

  it("flags a customer whose next order is more than 1.5 times its usual gap late", async () => {
    for (const d of [100, 70, 40]) await orderedAgo("Quiet Co", d); // every 30 days, nothing for 40: not yet (45)
    for (const d of [120, 90, 60]) await orderedAgo("Silent Co", d); // every 30 days, nothing for 60: late
    await orderedAgo("Once Co", 200); // one order: no rhythm to judge
    for (const d of [3, 3]) await orderedAgo("Busy Co", d); // same day twice: the gap counts as 7 days, 3 days is fine
    await draft({}, 1, "Draft Co"); // drafts are not orders

    const c = await byName();
    expect(c["Quiet Co"]).toMatchObject({ orders: 3, usualGapDays: 30, daysSinceOrder: 40, goingQuiet: false });
    expect(c["Silent Co"]).toMatchObject({ orders: 3, usualGapDays: 30, daysSinceOrder: 60, goingQuiet: true });
    expect(c["Once Co"]).toMatchObject({ orders: 1, usualGapDays: null, goingQuiet: false });
    expect(c["Busy Co"]).toMatchObject({ orders: 2, usualGapDays: 7, goingQuiet: false });
    expect(c["Draft Co"]).toMatchObject({ orders: 0, goingQuiet: false });
    expect((await all("SELECT COUNT(*) AS n FROM customers"))[0].n).toBe(5);
  });
});

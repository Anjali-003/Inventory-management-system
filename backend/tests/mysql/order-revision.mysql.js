/**
 * Quantity revision on the real MySQL (a throw-away copy, see helpers/mysqlDb.js):
 *   order-approvals revise()            PENDING_APPROVAL -> QUANTITY_REVISED, the order keeps only what will be made
 *   marketing-orders acceptRevision()   QUANTITY_REVISED -> PENDING_APPROVAL (back with the Operations Admin)
 *   marketing-orders declineRevision()  QUANTITY_REVISED -> CANCELLED
 *   order-approvals updateDeliveryDate() Marketing is told, only when the date really changed
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("t_revision"); // before anything from src/

const db = require("../../src/config/db");
const marketing = require("../../src/modules/marketing-orders/marketing-order.service");
const approvals = require("../../src/modules/order-approvals/order-approval.service");

let fx;
const one = async (sql, params) => (await db.query(sql, params))[0][0];
const all = async (sql, params) => (await db.query(sql, params))[0];
const qtyOf = async (orderId) =>
  Object.fromEntries((await all("SELECT p.name, oi.quantity FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?", [orderId])).map((r) => [r.name, Number(r.quantity)]));
const notes = (role, type) => all("SELECT * FROM notifications WHERE role = ? AND type = ? ORDER BY id", [role, type]);

/* 100 controllers + 40 sensors, sent by `by` (Marketing unless said), waiting for the Operations Admin. */
async function waitingOrder(by = "MARKETING_MANAGER") {
  const order = await marketing.createDraft({
    customer_name: "Test Traders", required_by_date: "2099-11-30",
    items: [{ productId: fx.products.Controller.id, quantity: 100 }, { productId: fx.products.Sensor.id, quantity: 40 }],
  }, fx.users[by]);
  await marketing.send(order.id, fx.users[by]);
  return order.id;
}
const ops = () => fx.users.OPERATIONS_ADMIN;
const ctrl = (quantity) => ({ product_id: fx.products.Controller.id, quantity });
const sens = (quantity) => ({ product_id: fx.products.Sensor.id, quantity });

beforeAll(testDb.create, 120_000);
beforeEach(async () => { fx = await testDb.reset(); });
afterAll(testDb.drop);

describe("Operations Admin revises the quantity", () => {
  it("keeps only what will be made and drops the rest: no draft is made in Marketing's name", async () => {
    const id = await waitingOrder();
    const order = await approvals.revise(id, { remarks: "Only 60 now, line is busy", items: [ctrl(60)] }, ops());

    expect(order.approval_status).toBe("QUANTITY_REVISED");
    expect(await qtyOf(id)).toEqual({ Controller: 60, Sensor: 40 }); // the sensor left out of the list keeps its quantity
    expect((await one("SELECT COUNT(*) AS n FROM orders")).n).toBe(1); // no second order, no draft
    expect(order.revision).toMatchObject({ remarks: "Only 60 now, line is busy" });
    expect(order.revision).not.toHaveProperty("held_order_id");
    expect(order.revision.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Controller", requested: 100, approved: 60, held: 40 }),
      expect.objectContaining({ name: "Sensor", requested: 40, approved: 40, held: 0 }),
    ]));
    // saved, so it is still in the bell if the Marketing Manager was offline
    expect(await notes("MARKETING_MANAGER", "QUANTITY_REVISED")).toEqual([expect.objectContaining({ order_id: id, severity: "action", link: `/marketing-orders?order=${id}` })]);
  });

  it("removes a product brought down to 0 from the order", async () => {
    const id = await waitingOrder();
    await approvals.revise(id, { remarks: "No sensors this month", items: [ctrl(100), sens(0)] }, ops());
    expect(await qtyOf(id)).toEqual({ Controller: 100 });
  });

  it("refuses what makes no sense, and changes nothing", async () => {
    const id = await waitingOrder();
    const tries = [
      { items: [ctrl(50)] }, // no reason
      { remarks: "same", items: [ctrl(100)] }, // nothing reduced
      { remarks: "none", items: [ctrl(0), sens(0)] }, // makes nothing: reject instead
      { remarks: "more", items: [ctrl(120)] }, // more than ordered
      { remarks: "half", items: [ctrl(10.5)] },
      { remarks: "other", items: [{ product_id: 999999, quantity: 1 }] }, // not in the order
    ];
    for (const body of tries) await expect(approvals.revise(id, body, ops())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await qtyOf(id)).toEqual({ Controller: 100, Sensor: 40 });
    expect((await one("SELECT approval_status FROM orders WHERE id = ?", [id])).approval_status).toBe("PENDING_APPROVAL");
  });

  it("promises any quantity up to the order, whatever the stock on the shelf", async () => {
    await db.query("UPDATE inventory SET quantity_on_hand = 0");
    const id = await waitingOrder();
    expect((await approvals.revise(id, { remarks: "60 this month", items: [ctrl(60)] }, ops())).approval_status).toBe("QUANTITY_REVISED");
  });

  it("revises a waiting order only once", async () => {
    const id = await waitingOrder();
    await approvals.revise(id, { remarks: "60 now", items: [ctrl(60)] }, ops());
    await expect(approvals.revise(id, { remarks: "50 now", items: [ctrl(50)] }, ops())).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("revises an order the Super Admin raised (the CEO doing Marketing's work)", async () => {
    const id = await waitingOrder("SUPER_ADMIN");
    expect((await approvals.revise(id, { remarks: "60 now", items: [ctrl(60)] }, ops())).approval_status).toBe("QUANTITY_REVISED");
  });
});

describe("Marketing answers the revised quantity", () => {
  it("accepting sends the order back to the Operations Admin, who is told", async () => {
    const id = await waitingOrder();
    await approvals.revise(id, { remarks: "60 now", items: [ctrl(60)] }, ops());

    const order = await marketing.acceptRevision(id, fx.users.MARKETING_MANAGER);
    expect(order.approval_status).toBe("PENDING_APPROVAL");
    expect(await qtyOf(id)).toEqual({ Controller: 60, Sensor: 40 });
    expect(await notes("OPERATIONS_ADMIN", "REVISION_ACCEPTED")).toHaveLength(1);
    await expect(marketing.acceptRevision(id, fx.users.MARKETING_MANAGER)).rejects.toMatchObject({ code: "NOT_REVISED" });
  });

  it("declining cancels the order and tells the Operations Admin", async () => {
    const id = await waitingOrder();
    await approvals.revise(id, { remarks: "60 now", items: [ctrl(60)] }, ops());

    const order = await marketing.declineRevision(id, fx.users.MARKETING_MANAGER);
    expect(order.approval_status).toBe("CANCELLED");
    expect(order.revision).toMatchObject({ declined_by_name: expect.any(String) });
    expect(await notes("OPERATIONS_ADMIN", "REVISION_DECLINED")).toHaveLength(1);
  });

  it("the Super Admin can decline on its own order too (same as accept)", async () => {
    const id = await waitingOrder("SUPER_ADMIN");
    await approvals.revise(id, { remarks: "60 now", items: [ctrl(60)] }, ops());
    expect((await marketing.declineRevision(id, fx.users.SUPER_ADMIN)).approval_status).toBe("CANCELLED");
  });
});

describe("Operations Admin changes the expected delivery date", () => {
  it("saves the date and tells the Marketing Manager, linking to the order", async () => {
    const id = await waitingOrder();
    await approvals.updateDeliveryDate(id, { estimated_delivery_date: "2099-12-15", reason: "Supplier delay" }, { id: ops() });

    const dates = await one("SELECT DATE_FORMAT(required_by_date, '%Y-%m-%d') AS wanted, DATE_FORMAT(estimated_delivery_date, '%Y-%m-%d') AS planned FROM orders WHERE id = ?", [id]);
    expect(dates).toEqual({ wanted: "2099-11-30", planned: "2099-12-15" }); // the customer's date is kept
    expect(await notes("MARKETING_MANAGER", "DELIVERY_DATE_CHANGED")).toEqual([
      expect.objectContaining({ body: "30 Nov 2099 → 15 Dec 2099 · customer wants it by 30 Nov 2099 · Supplier delay", severity: "warning", link: `/marketing-orders?order=${id}`, order_id: id }),
    ]);
  });

  it("tells nobody when the date did not actually change", async () => {
    const id = await waitingOrder();
    await approvals.updateDeliveryDate(id, { estimated_delivery_date: "2099-11-30" }, { id: ops() });
    expect(await notes("MARKETING_MANAGER", "DELIVERY_DATE_CHANGED")).toEqual([]);
  });
});

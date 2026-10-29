/**
 * One purchase order for the shortages of SEVERAL orders (the Purchase Manager's combined order), on the real MySQL
 * (a throw-away copy, see helpers/mysqlDb.js).
 *
 *   two approved orders are short of the same components -> the Operations Admin sends each list to Purchase ->
 *   the Purchase Manager places ONE purchase order: per component, the lines of both orders, in one quantity
 *
 * The rules: never less than the covered lines need (the surplus goes to stock), each line on one purchase order only.
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("t_purchase"); // before anything from src/

const db = require("../../src/config/db");
const marketing = require("../../src/modules/marketing-orders/marketing-order.service");
const approvals = require("../../src/modules/order-approvals/order-approval.service");
const purchase = require("../../src/modules/purchase/purchase.service");

let fx;
const key = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/* An order of `units` controllers, approved, with its short components sent to Purchase. */
async function shortOrder(units) {
  const order = await marketing.createDraft({ customer_name: "Test Traders", required_by_date: "2099-11-30", items: [{ productId: fx.products.Controller.id, quantity: units }] }, fx.users.MARKETING_MANAGER);
  await marketing.send(order.id, fx.users.MARKETING_MANAGER);
  const before = await approvals.getPlan(order.id);
  await approvals.approve(order.id, { idempotency_key: key("ap"), expected_round: before.approval_round }, fx.users.OPERATIONS_ADMIN);
  const plan = await approvals.getPlan(order.id);
  await approvals.sendToPurchase(order.id, { purchase_items: plan.shortages.map((s) => ({ component_id: s.component_id, quantity: s.shortage })) }, fx.users.OPERATIONS_ADMIN);
  return order.id;
}

/* the lines the Operations Admin sent to Purchase, per component: [{ id, order_id, quantity }] */
async function linesByComponent() {
  const [rows] = await db.query("SELECT id, order_id, component_id, quantity, purchase_order_id FROM order_purchase_items ORDER BY id");
  const by = new Map();
  for (const r of rows) by.set(r.component_id, [...(by.get(r.component_id) || []), { ...r, quantity: Number(r.quantity) }]);
  return by;
}

beforeAll(testDb.create, 120_000);
beforeEach(async () => {
  fx = await testDb.reset();
  await db.query("UPDATE inventory SET quantity_on_hand = 0"); // nothing on the shelf: every order is short of everything
});
afterAll(testDb.drop);

describe("one purchase order for several orders", () => {
  it("covers the shortages of two orders, component by component, in one quantity", async () => {
    const first = await shortOrder(20);
    const second = await shortOrder(30);
    const byComponent = await linesByComponent();
    expect(byComponent.size).toBe(3); // the controller's 3 components

    const po = await purchase.createPurchase({
      supplier: "Shree Components", expected_delivery_date: "2026-12-15",
      items: [...byComponent].map(([componentId, lines]) => ({
        component_id: componentId,
        quantity: lines.reduce((s, l) => s + l.quantity, 0) + 50, // round up: the extra 50 go to stock
        rate: 2,
        request_item_ids: lines.map((l) => l.id),
      })),
    }, fx.users.PURCHASE_MANAGER);

    // one purchase order, 3 lines (one per component), each = both orders' need + 50
    expect(po.items).toHaveLength(3);
    const screw = fx.products.Controller.components.find((c) => c.sku === "T-SCR"); // 4 per controller
    const screwLine = po.items.find((i) => Number(i.component_id) === screw.id);
    expect(Number(screwLine.quantity_ordered)).toBe(4 * 20 + 4 * 30 + 50);

    // every line of both orders is now on it, and it is tied to both orders (so to no single one)
    const [lines] = await db.query("SELECT order_id, purchase_order_id FROM order_purchase_items");
    expect(lines.every((l) => l.purchase_order_id === po.id)).toBe(true);
    expect(new Set(lines.map((l) => l.order_id))).toEqual(new Set([first, second]));
    const [[header]] = await db.query("SELECT order_id FROM purchase_orders WHERE id = ?", [po.id]);
    expect(header.order_id).toBeNull();
  });

  it("refuses less than the covered lines need", async () => {
    await shortOrder(20);
    await shortOrder(30);
    const [[componentId, lines]] = [...(await linesByComponent())];
    const need = lines.reduce((s, l) => s + l.quantity, 0);
    await expect(purchase.createPurchase({
      supplier: "Shree Components", expected_delivery_date: "2026-12-15",
      items: [{ component_id: componentId, quantity: need - 1, rate: 2, request_item_ids: lines.map((l) => l.id) }],
    }, fx.users.PURCHASE_MANAGER)).rejects.toMatchObject({ status: 422 });
  });

  it("a line can be on one purchase order only", async () => {
    await shortOrder(20);
    const [[componentId, lines]] = [...(await linesByComponent())];
    const body = {
      supplier: "Shree Components", expected_delivery_date: "2026-12-15",
      items: [{ component_id: componentId, quantity: lines[0].quantity, rate: 2, request_item_ids: [lines[0].id] }],
    };
    await purchase.createPurchase(body, fx.users.PURCHASE_MANAGER);
    await expect(purchase.createPurchase(body, fx.users.PURCHASE_MANAGER)).rejects.toMatchObject({ code: "ALREADY_ORDERED" });
  });
});

/**
 * Production on the real MySQL (a throw-away copy, see helpers/mysqlDb.js): starting a product line, recording what
 * was built, and when the order moves on to QC. Every order is set up the way the app does it: Marketing sends it,
 * the Operations Admin approves it and sends it to Production, Production asks the Store and the Store hands over.
 *
 * The rules:
 *   - only an APPROVED order can be started, never more units than the order line, and never more than the material
 *     the Store has handed over for that line
 *   - each product line of an order has its own run and its own limit
 *   - production never moves stock (the stock was taken when the order was sent to Production)
 *   - the order goes to TESTING only when EVERY product line is built
 */
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("t_production"); // before anything from src/

const db = require("../../src/config/db");
const marketing = require("../../src/modules/marketing-orders/marketing-order.service");
const approvals = require("../../src/modules/order-approvals/order-approval.service");
const materialRequests = require("../../src/modules/material-requests/material-request.service");
const production = require("../../src/modules/production/production.service");

let fx; // fixtures: users per role, products, stock
const key = (p = "k") => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const stockTotal = async () => Number((await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory"))[0][0].s);

/* An order sent by Marketing, approved, and sent to Production in full. Returns its id and its lines (one per product). */
async function approvedOrder(lines) {
  const order = await marketing.createDraft(
    { customer_name: "Test Traders", items: lines.map(([product, quantity]) => ({ productId: fx.products[product].id, quantity })) },
    fx.users.MARKETING_MANAGER
  );
  await marketing.send(order.id, fx.users.MARKETING_MANAGER);
  const before = await approvals.getPlan(order.id);
  await approvals.approve(order.id, { idempotency_key: key("ap"), expected_round: before.approval_round }, fx.users.OPERATIONS_ADMIN);
  const plan = await approvals.getPlan(order.id);
  await approvals.sendToProduction(order.id, {
    idempotency_key: key("pr"),
    expected_round: plan.approval_round,
    production_items: plan.lines.map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
  }, fx.users.OPERATIONS_ADMIN);
  const [items] = await db.query("SELECT oi.id, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id", [order.id]);
  return { orderId: order.id, line: Object.fromEntries(items.map((i) => [i.name, i.id])) };
}

/* Production asks for the material of `units` products of a line, and the Store hands all of it over. */
async function handOver(orderItemId, units) {
  const options = await materialRequests.getOptions(orderItemId);
  const asked = await materialRequests.createRequest({
    order_item_id: orderItemId, product_quantity: units, request_key: key("rq"),
    items: options.items.map((i) => ({ component_id: i.component_id, quantity: Number(i.quantity_per_product) * units })),
  }, fx.users.PRODUCTION_MANAGER);
  const request = (await materialRequests.listRequests()).find((r) => Number(r.id) === asked.request_id);
  await materialRequests.issueRequest(request.id, {
    items: request.items.map((i) => ({ request_item_id: i.id, quantity: Number(i.quantity_per_product) * units })),
    product_quantity: units, idempotency_key: key("is"),
  }, fx.users.STORE_MANAGER);
}

const orderStatus = async (id) => (await db.query("SELECT status FROM orders WHERE id = ?", [id]))[0][0].status;
const start = (orderItemId, quantity) => production.startProduction(orderItemId, quantity, fx.users.PRODUCTION_MANAGER);
const built = (runId, quantity) => production.updateProductionProgress(runId, quantity, fx.users.PRODUCTION_MANAGER);

beforeAll(testDb.create, 120_000);
beforeEach(async () => { fx = await testDb.reset(); });
afterAll(testDb.drop);

describe("starting production", () => {
  it("starts only as many units as the Store has handed material for", async () => {
    const { line } = await approvedOrder([["Controller", 5]]);
    await handOver(line.Controller, 3);

    const run = await start(line.Controller, 3);
    expect(run).toMatchObject({ status: "IN_PRODUCTION", totalStarted: 3, remainingToStart: 2 });
    await expect(start(line.Controller, 1)).rejects.toMatchObject({ status: 409, code: "MATERIALS_NOT_ISSUED" });

    await handOver(line.Controller, 2); // the rest of the material arrives
    expect(await start(line.Controller, 2)).toMatchObject({ totalStarted: 5, remainingToStart: 0 });
  });

  it("never starts more units than the order line", async () => {
    const { line } = await approvedOrder([["Controller", 4]]);
    await handOver(line.Controller, 4);
    await start(line.Controller, 4);
    await expect(start(line.Controller, 1)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps a separate limit for each product of the order", async () => {
    const { line } = await approvedOrder([["Controller", 5], ["Sensor", 4]]);
    await handOver(line.Controller, 5); // material for the controllers only

    await start(line.Controller, 5);
    await expect(start(line.Sensor, 1)).rejects.toMatchObject({ status: 409, code: "MATERIALS_NOT_ISSUED" });
    const info = await production.getProductionInfo(line.Sensor);
    expect(info).toMatchObject({ productName: "Sensor", orderedQuantity: 4, quantityToProduce: 0, maxProductionQuantity: 0 });
  });

  it("refuses an order that is not approved", async () => {
    const order = await marketing.createDraft({ customer_name: "Test Traders", items: [{ productId: fx.products.Controller.id, quantity: 2 }] }, fx.users.MARKETING_MANAGER);
    await marketing.send(order.id, fx.users.MARKETING_MANAGER);
    const [[item]] = await db.query("SELECT id FROM order_items WHERE order_id = ?", [order.id]);
    await expect(start(item.id, 1)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a quantity that is not a whole number above 0, and a line that does not exist", async () => {
    const { line } = await approvedOrder([["Controller", 2]]);
    await handOver(line.Controller, 2);
    await expect(start(line.Controller, 0)).rejects.toMatchObject({ status: 400 });
    await expect(start(line.Controller, 1.5)).rejects.toMatchObject({ status: 400 });
    await expect(start(999999, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe("recording what was built", () => {
  it("never moves stock: it was taken when the order was sent to Production", async () => {
    const { line } = await approvedOrder([["Controller", 3]]);
    await handOver(line.Controller, 3);
    const before = await stockTotal();
    const run = await start(line.Controller, 3);
    await production.completeProduction(run.productionId, fx.users.PRODUCTION_MANAGER);
    expect(await stockTotal()).toBe(before);
  });

  it("cannot record more than was started; the run completes when the whole line is built", async () => {
    const { line } = await approvedOrder([["Controller", 4]]);
    await handOver(line.Controller, 4);
    const run = await start(line.Controller, 4);

    await expect(built(run.productionId, 5)).rejects.toMatchObject({ status: 409 });
    expect(await built(run.productionId, 1)).toMatchObject({ status: "IN_PRODUCTION", quantityCompleted: 1, progressPercentage: 25 });
    expect(await built(run.productionId, 3)).toMatchObject({ status: "COMPLETED", quantityCompleted: 4 });
  });

  it("completing a run twice is refused the second time", async () => {
    const { line } = await approvedOrder([["Controller", 2]]);
    await handOver(line.Controller, 2);
    const run = await start(line.Controller, 2);
    await production.completeProduction(run.productionId, fx.users.PRODUCTION_MANAGER);
    await expect(production.completeProduction(run.productionId, fx.users.PRODUCTION_MANAGER)).rejects.toMatchObject({ status: 409 });
  });

  it("moves the order to TESTING only when EVERY product line is built", async () => {
    const { orderId, line } = await approvedOrder([["Controller", 2], ["Sensor", 3]]);
    await handOver(line.Controller, 2);
    await handOver(line.Sensor, 3);
    const controllers = await start(line.Controller, 2);
    const sensors = await start(line.Sensor, 3);

    await production.completeProduction(controllers.productionId, fx.users.PRODUCTION_MANAGER);
    expect(await orderStatus(orderId)).toBe("IN_PRODUCTION"); // sensors not built yet
    await production.completeProduction(sensors.productionId, fx.users.PRODUCTION_MANAGER);
    expect(await orderStatus(orderId)).toBe("TESTING");
  });
});

/**
 * Operations Admin plan + dispatch (modules/order-approvals/order-approval.service.js).
 *   npm test
 * MySQL is replaced by a tiny in-memory fake that understands only the queries this service sends, so this proves
 * the logic (plan, stale-plan check, what gets saved), not one real run against MySQL.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/* ---- fake database ------------------------------------------------------------------------------------------ */
let s;
const fresh = () => ({
  order: { id: 7, order_number: "ORD-007", status: "PENDING", approval_status: "PENDING_APPROVAL", approval_remarks: null },
  items: [{ product_id: 1, sku: "PRD-001", name: "Smart Controller", quantity: "10.00" }],
  bom: [
    { product_id: 1, component_id: 1, quantity_required: "2.00", sku: "CMP-001", name: "Resistor", unit: "pcs" },
    { product_id: 1, component_id: 2, quantity_required: "1.00", sku: "CMP-002", name: "Capacitor", unit: "pcs" },
  ],
  inventory: [
    { component_id: 1, quantity_on_hand: "15.00", quantity_reserved: "3.00" }, // 12 available -> 6 units
    { component_id: 2, quantity_on_hand: "100.00", quantity_reserved: "0.00" },
  ],
  productionRows: [],
  purchaseRows: [],
  locks: 0,
});

const has = (sql, text) => sql.replace(/\s+/g, " ").includes(text);
function run(sql, params = []) {
  if (has(sql, "SELECT id, approval_status FROM orders WHERE id = ? FOR UPDATE")) { s.locks++; return [s.order.id === params[0] ? [{ ...s.order }] : []]; }
  if (has(sql, "SELECT approval_status FROM orders WHERE id = ?")) return [s.order.id === params[0] ? [{ approval_status: s.order.approval_status }] : []];
  if (has(sql, "FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")) return [s.items];
  if (has(sql, "FROM order_items oi") && has(sql, "oi.order_id IN")) return [s.items.map((i) => ({ ...i, order_id: s.order.id }))];
  if (has(sql, "FROM product_bom pb")) return [s.bom];
  if (has(sql, "FROM inventory WHERE component_id IN")) { if (has(sql, "FOR UPDATE")) s.locks++; return [s.inventory]; }
  if (has(sql, "UPDATE orders SET approval_status = 'APPROVED'")) { s.order = { ...s.order, approval_status: "APPROVED", approval_remarks: params[0] }; return [{}]; }
  if (has(sql, "INSERT INTO order_production_items")) { s.productionRows.push(...params[0]); return [{}]; }
  if (has(sql, "INSERT INTO order_purchase_items")) { s.purchaseRows.push(...params[0]); return [{}]; }
  if (has(sql, "FROM order_production_items r")) {
    return [s.productionRows.map(([order_id, product_id, quantity]) => ({ order_id, product_id, sku: "PRD-001", name: "Smart Controller", quantity, sent_by_name: "Ops", sent_at: "2026-10-14 11:00:00" }))];
  }
  if (has(sql, "FROM order_purchase_items r")) {
    return [s.purchaseRows.map(([order_id, component_id, quantity]) => ({ order_id, component_id, sku: `CMP-00${component_id}`, name: "Resistor", unit: "pcs", quantity, sent_by_name: "Ops", sent_at: "2026-10-14 11:00:00" }))];
  }
  if (has(sql, "FROM orders o LEFT JOIN users cu")) return [[{ ...s.order, created_by_name: "Marketing", approved_by_name: "Ops" }]];
  throw new Error("fake db: unexpected query: " + sql.replace(/\s+/g, " ").slice(0, 120));
}
const conn = { query: async (sql, p) => run(sql, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
const fakeDb = { query: conn.query, getConnection: async () => conn };

require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const service = require("../src/modules/order-approvals/order-approval.service.js");

const rightLists = () => ({
  production_items: [{ product_id: 1, quantity: 6 }],
  purchase_items: [{ component_id: 1, quantity: 8 }],
});

beforeEach(() => { s = fresh(); });

describe("getPlan", () => {
  it("shows what can be built now and which component is short", async () => {
    const plan = await service.getPlan(7);
    expect(plan.lines[0]).toMatchObject({ product_id: 1, name: "Smart Controller", ordered: 10, can_make: 6, remaining: 4 });
    expect(plan.shortages).toHaveLength(1);
    expect(plan.shortages[0]).toMatchObject({ component_id: 1, name: "Resistor", required: 8, available: 0, shortage: 8 });
    expect(plan.fully_producible).toBe(false);
  });

  it("reports a product with an unfinished BOM instead of guessing", async () => {
    s.bom[1].quantity_required = null;
    const plan = await service.getPlan(7);
    expect(plan.missing_bom).toEqual([1]);
    expect(plan.lines[0].can_make).toBe(0);
  });

  it("refuses an order that is already decided", async () => {
    s.order.approval_status = "APPROVED";
    await expect(service.getPlan(7)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECIDED" });
  });
});

describe("dispatch", () => {
  it("approves the order and saves both lists", async () => {
    const order = await service.dispatch(7, { remarks: "go", ...rightLists() }, 5);
    expect(s.order.approval_status).toBe("APPROVED");
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(s.purchaseRows).toEqual([[7, 1, 8, 5]]);
    expect(order.production_request.items[0]).toMatchObject({ product_id: 1, quantity: 6 });
    expect(order.purchase_request.items[0]).toMatchObject({ component_id: 1, quantity: 8 });
  });

  it("locks the stock rows while it re-checks the plan", async () => {
    await service.dispatch(7, rightLists(), 5);
    expect(s.locks).toBeGreaterThan(1); // the order row + the inventory rows
  });

  it("refuses with STALE_PLAN when the stock changed after the admin looked, and saves nothing", async () => {
    s.inventory[0].quantity_on_hand = "11.00"; // only 8 available now -> 4 units, not 6
    await expect(service.dispatch(7, rightLists(), 5)).rejects.toMatchObject({ status: 409, code: "STALE_PLAN" });
    expect(s.order.approval_status).toBe("PENDING_APPROVAL");
    expect(s.productionRows).toEqual([]);
    expect(s.purchaseRows).toEqual([]);
  });

  it("refuses a list the admin edited by hand", async () => {
    await expect(service.dispatch(7, { ...rightLists(), production_items: [{ product_id: 1, quantity: 10 }] }, 5))
      .rejects.toMatchObject({ status: 409, code: "STALE_PLAN" });
  });

  it("refuses an order that was decided meanwhile", async () => {
    s.order.approval_status = "REJECTED";
    await expect(service.dispatch(7, rightLists(), 5)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECIDED" });
  });

  it("refuses to send when both lists are empty", async () => {
    await expect(service.dispatch(7, { production_items: [], purchase_items: [] }, 5)).rejects.toMatchObject({ status: 422 });
  });

  it("only sends the production list when nothing is short", async () => {
    s.inventory[0].quantity_on_hand = "100.00";
    const order = await service.dispatch(7, { production_items: [{ product_id: 1, quantity: 10 }], purchase_items: [] }, 5);
    expect(order.production_request.items[0].quantity).toBe(10);
    expect(order.purchase_request).toBe(null);
  });
});

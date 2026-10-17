/**
 * Production per ORDER + PRODUCT (modules/production/production.service.js) for orders whose materials were issued at
 * approval. MySQL is replaced by a small in-memory fake that understands only the queries this service sends.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let s;

const fresh = () => ({
  order: { id: 12, order_number: "ORD-012", status: "PENDING", approval_status: "PARTIALLY_APPROVED", inventory_issued_at: "2026-10-16 12:00:00" },
  lines: [
    { product_id: 1, ordered_quantity: "5.00", product_sku: "PRD-001", product_name: "Controller" },
    { product_id: 2, ordered_quantity: "4.00", product_sku: "PRD-002", product_name: "Sensor" },
  ],
  approved: { 1: 3, 2: 2 }, // units approved by Operations per product (all passes added up)
  runs: [],
  queries: [],
  nextId: 31,
});

const norm = (sql) => sql.replace(/\s+/g, " ").trim();
const has = (sql, text) => sql.includes(text);

function run(rawSql, params = []) {
  const sql = norm(rawSql);
  s.queries.push(sql);

  if (/SELECT id, order_number, status,( approval_status,)? inventory_issued_at FROM orders WHERE id = \?/.test(sql)) return [[{ ...s.order }]];
  if (has(sql, "GROUP BY oi.product_id, p.sku, p.name")) return [s.lines.map((l) => ({ ...l }))];
  if (has(sql, "SELECT COALESCE(SUM(oi.quantity), 0) AS ordered_quantity")) {
    const [, productId] = params;
    const line = s.lines.find((l) => l.product_id === productId);
    return [[{ ordered_quantity: line ? line.ordered_quantity : "0", approved_quantity: String(s.approved[productId] || 0) }]];
  }
  if (has(sql, "FROM production_orders WHERE order_id = ? AND product_id = ?")) {
    const row = s.runs.find((r) => r.order_id === params[0] && r.product_id === params[1]);
    return [row ? [{ ...row }] : []];
  }
  if (has(sql, "INSERT INTO production_orders")) {
    const [order_id, product_id, quantity_to_produce] = params;
    s.runs.push({ id: s.nextId, order_id, product_id, status: "IN_PRODUCTION", quantity_to_produce, quantity_completed: 0 });
    return [{ insertId: s.nextId++ }];
  }
  if (has(sql, "UPDATE production_orders SET quantity_to_produce = quantity_to_produce + ?")) {
    const row = s.runs.find((r) => r.id === params[2]);
    row.quantity_to_produce += params[0];
    row.status = "IN_PRODUCTION";
    return [{ affectedRows: 1 }];
  }
  if (has(sql, "UPDATE orders SET status = 'IN_PRODUCTION' WHERE id = ?")) { s.order.status = "IN_PRODUCTION"; return [{ affectedRows: 1 }]; }
  if (has(sql, "FROM production_orders po JOIN orders o ON o.id = po.order_id WHERE po.id = ? FOR UPDATE")) {
    const row = s.runs.find((r) => r.id === params[0]);
    return [row ? [{ ...row, order_number: s.order.order_number, inventory_issued_at: s.order.inventory_issued_at }] : []];
  }
  if (has(sql, "SELECT quantity_to_produce, quantity_completed FROM production_orders WHERE id = ?")) {
    const row = s.runs.find((r) => r.id === params[0]);
    return [row ? [{ quantity_to_produce: row.quantity_to_produce, quantity_completed: row.quantity_completed }] : []];
  }
  if (has(sql, "UPDATE production_orders SET quantity_completed = ?")) {
    const row = s.runs.find((r) => r.id === params[4]);
    row.quantity_completed = params[0];
    row.status = params[1];
    return [{ affectedRows: 1 }];
  }
  // refreshOrderStatus(): one row per product with its target / built / boxed / shipped units
  if (has(sql, "SELECT DISTINCT order_id, product_id FROM order_items")) {
    return [s.lines.map((l) => {
      const runRow = s.runs.find((r) => r.product_id === l.product_id);
      return { product_id: l.product_id, target: String(s.approved[l.product_id] || 0), completed: runRow ? runRow.quantity_completed : 0, boxed: 0, shipped: 0 };
    })];
  }
  if (has(sql, "UPDATE orders SET status = ?") && has(sql, "status <> 'COMPLETED'")) { s.order.status = params[0]; return [{ affectedRows: 1 }]; }
  throw new Error(`fake db: unexpected SQL: ${sql}`);
}

const connection = () => ({
  query: async (sql, params) => run(sql, params),
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {},
});
const fakeDb = { query: async (sql, params) => run(sql, params), getConnection: async () => connection() };

require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const service = require("../src/modules/production/production.service.js");

const touchedStock = () => s.queries.some((sql) => sql.includes("UPDATE inventory") || sql.includes("INSERT INTO inventory_transactions"));

beforeEach(() => { s = fresh(); });

describe("production per product, materials issued at approval", () => {
  it("starts one product within ITS approved quantity without reserving stock again", async () => {
    const result = await service.startProduction(12, 2, 5, 1);
    expect(result).toMatchObject({ productId: 1, quantityStarted: 2, totalStarted: 2, remainingToStart: 1, status: "IN_PRODUCTION" });
    expect(s.runs).toHaveLength(1);
    expect(s.runs[0]).toMatchObject({ order_id: 12, product_id: 1, quantity_to_produce: 2 });
    expect(touchedStock()).toBe(false);
  });

  it("keeps a separate run and limit for each product of the order", async () => {
    await service.startProduction(12, 3, 5, 1);
    await service.startProduction(12, 2, 5, 2);
    expect(s.runs.map((r) => [r.product_id, r.quantity_to_produce])).toEqual([[1, 3], [2, 2]]);
    await expect(service.startProduction(12, 1, 5, 2)).rejects.toMatchObject({ status: 409 }); // sensor: only 2 approved
    await expect(service.startProduction(12, 1, 5, 1)).rejects.toMatchObject({ status: 409 }); // controller: only 3 approved
  });

  it("does not use the ordered quantity of other products or the not-yet-approved units as the limit", async () => {
    // 5 controllers ordered but only 3 approved: 4 cannot be started
    await expect(service.startProduction(12, 4, 5, 1)).rejects.toMatchObject({ status: 409 });
    expect(s.runs).toHaveLength(0);
  });

  it("asks which product when the order has several", async () => {
    await expect(service.startProduction(12, 1, 5)).rejects.toMatchObject({ status: 400 });
    await expect(service.getProductionInfo(12)).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to start production on an order that is not approved, so stock is never taken twice", async () => {
    s.order.approval_status = "PENDING_APPROVAL";
    s.order.inventory_issued_at = null; // nothing issued yet: starting would reserve stock that approval then issues again
    await expect(service.startProduction(12, 1, 5, 1)).rejects.toMatchObject({ status: 409 });
    expect(s.runs).toHaveLength(0);
    expect(touchedStock()).toBe(false);
    s.order.approval_status = "REJECTED";
    await expect(service.startProduction(12, 1, 5, 1)).rejects.toMatchObject({ status: 409 });
  });

  it("completing a run twice does not consume anything (second call is refused, stock untouched)", async () => {
    await service.startProduction(12, 3, 5, 1);
    await service.completeProduction(31, 5);
    await expect(service.completeProduction(31, 5)).rejects.toMatchObject({ status: 409 });
    expect(touchedStock()).toBe(false);
  });

  it("never reserves or consumes stock, even for an older order whose materials were not issued at approval", async () => {
    s.order.approval_status = "APPROVED";
    s.order.inventory_issued_at = null;
    s.lines = [{ product_id: 1, ordered_quantity: "5.00", product_sku: "PRD-001", product_name: "Controller" }];
    await service.startProduction(12, 5, 5, 1);
    await service.completeProduction(31, 5);
    expect(s.runs[0]).toMatchObject({ quantity_completed: 5, status: "COMPLETED" });
    expect(touchedStock()).toBe(false);
  });

  it("refuses a product that is not part of the order", async () => {
    await expect(service.startProduction(12, 1, 5, 99)).rejects.toMatchObject({ status: 404 });
  });

  it("reports progress for the chosen product only", async () => {
    await service.startProduction(12, 2, 5, 1);
    const info = await service.getProductionInfo(12, 1);
    expect(info).toMatchObject({ productId: 1, productName: "Controller", orderedQuantity: 3, quantityToProduce: 2, remainingToStart: 1, maxProductionQuantity: 1, materialsIssued: true });
    const other = await service.getProductionInfo(12, 2);
    expect(other).toMatchObject({ productId: 2, orderedQuantity: 2, quantityToProduce: 0, remainingToStart: 2, productionStatus: "NOT_STARTED" });
  });

  it("completes a product's run without consuming BOM materials a second time", async () => {
    await service.startProduction(12, 3, 5, 1);
    const result = await service.completeProduction(31, 5);
    expect(result).toMatchObject({ productId: 1, quantityCompleted: 3, orderedQuantity: 3, status: "COMPLETED" });
    expect(touchedStock()).toBe(false);
  });

  it("moves the order to TESTING only after EVERY product has been built", async () => {
    await service.startProduction(12, 3, 5, 1);
    await service.startProduction(12, 2, 5, 2);

    await service.completeProduction(s.runs[0].id, 5); // controllers done, sensors not
    expect(s.order.status).toBe("IN_PRODUCTION");

    await service.completeProduction(s.runs[1].id, 5); // sensors done too
    expect(s.order.status).toBe("TESTING");
  });

  it("an approved product that was not started yet keeps the order in production", async () => {
    await service.startProduction(12, 3, 5, 1);
    await service.completeProduction(s.runs[0].id, 5); // sensors (2 approved) never started
    expect(s.order.status).toBe("IN_PRODUCTION");
  });

  it("units approved later can be started on the same run after the first batch was built", async () => {
    await service.startProduction(12, 3, 5, 1);
    await service.completeProduction(31, 5);
    expect(s.runs[0].status).toBe("COMPLETED");
    s.order.status = "PACKAGING"; // first batch boxed meanwhile
    s.approved[1] = 5; // Operations approves the remaining 2 controllers

    const info = await service.getProductionInfo(12, 1);
    expect(info).toMatchObject({ orderedQuantity: 5, quantityToProduce: 3, quantityCompleted: 3, remainingToStart: 2 });

    const result = await service.startProduction(12, 2, 5, 1);
    expect(result).toMatchObject({ totalStarted: 5, remainingToStart: 0 });
    expect(s.runs).toHaveLength(1); // same run, not a second one
    expect(s.runs[0]).toMatchObject({ quantity_to_produce: 5, status: "IN_PRODUCTION" });
    expect(s.order.status).toBe("IN_PRODUCTION");
  });
});

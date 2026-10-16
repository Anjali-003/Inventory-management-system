import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let state;

function run(sql, params = []) {
  const query = sql.replace(/\s+/g, " ").trim();
  state.queries.push(query);

  if (query.includes("SELECT id, order_number, status, inventory_issued_at FROM orders WHERE id = ?")) {
    return [[{ id: params[0], order_number: "ORD-001", status: "PENDING", inventory_issued_at: "2026-10-16 12:00:00" }]];
  }
  if (query.includes("SELECT COALESCE(SUM(oi.quantity)")) {
    return [[{ ordered_quantity: "12.00", approved_quantity: "3.00", product_names: "Controller, Sensor" }]];
  }
  if (query.includes("SELECT po.id, po.status, po.quantity_to_produce")) {
    return [state.progress ? [{ ...state.progress }] : []];
  }
  if (query.includes("o.inventory_issued_at")) {
    return [[{ ...state.progress, order_number: "ORD-001", inventory_issued_at: "2026-10-16 12:00:00" }]];
  }
  if (query.includes("INSERT INTO production_orders")) {
    state.progress = { id: 31, order_id: params[0], status: "IN_PRODUCTION", quantity_to_produce: params[1], quantity_completed: 0 };
    return [{ insertId: 31 }];
  }
  if (query.includes("UPDATE production_orders SET quantity_completed")) {
    state.progress.quantity_completed = params[0];
    state.progress.status = params[1];
    return [{ affectedRows: 1 }];
  }
  if (query.includes("UPDATE production_orders SET quantity_to_produce")) {
    state.progress.quantity_to_produce += params[0];
    return [{ affectedRows: 1 }];
  }
  if (query.includes("UPDATE orders SET status")) return [{ affectedRows: 1 }];
  if (query.includes("SELECT quantity_to_produce, quantity_completed FROM production_orders")) {
    return [[{ quantity_to_produce: state.progress.quantity_to_produce, quantity_completed: state.progress.quantity_completed }]];
  }
  throw new Error(`fake db: unexpected SQL: ${query}`);
}

const fakeDb = {
  query: async (sql, params) => run(sql, params),
  getConnection: async () => ({
    query: async (sql, params) => run(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  }),
};

require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const service = require("../src/modules/production/production.service.js");

beforeEach(() => {
  state = {
    progress: null,
    queries: [],
  };
});

describe("production for materials issued at approval", () => {
  it("starts production within approved totals for a multi-product order without reserving stock again", async () => {
    const result = await service.startProduction(12, 2, 5);
    expect(result).toMatchObject({ quantityStarted: 2, remainingToStart: 1 });
    expect(state.queries.some((sql) => sql.includes("UPDATE inventory") || sql.includes("INSERT INTO inventory_transactions"))).toBe(false);
  });

  it("completes production without consuming BOM materials a second time", async () => {
    state.progress = {
      id: 31,
      order_id: 12,
      status: "IN_PRODUCTION",
      quantity_to_produce: 3,
      quantity_completed: 1,
    };
    const result = await service.completeProduction(31, 5);
    expect(result).toMatchObject({ quantityCompleted: 3, orderedQuantity: 3, status: "COMPLETED" });
    expect(state.queries.some((sql) => sql.includes("UPDATE inventory") || sql.includes("INSERT INTO inventory_transactions"))).toBe(false);
  });
});

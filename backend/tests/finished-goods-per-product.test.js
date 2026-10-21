/**
 * Finished goods are boxed per production run (= per product, per approval pass) and the order status follows all
 * products (finished-goods.service.js + orders/order-status.js). MySQL is replaced by a small in-memory fake.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let s;

const fresh = () => ({
  order: { id: 12, status: "TESTING" },
  // one production run per product; target = approved quantity of that product
  runs: [
    { id: 31, product_id: 1, target: 3, completed: 3, tested: 3, failed: 0, inspected: 3, approved: 3 },
    { id: 32, product_id: 2, target: 2, completed: 2, tested: 2, failed: 0, inspected: 2, approved: 2 },
  ],
  boxes: [], // { id, production_id, quantity, status }
});

const norm = (sql) => sql.replace(/\s+/g, " ").trim();
const has = (sql, text) => sql.includes(text);

function run(rawSql, params = []) {
  const sql = norm(rawSql);
  if (has(sql, "FROM production_orders po JOIN orders o ON o.id = po.order_id WHERE po.id = ? LIMIT 1")) {
    const r = s.runs.find((x) => x.id === params[0]);
    return [r ? [{ id: r.id, order_id: s.order.id, quantity_completed: r.completed, ordered_quantity: r.target }] : []];
  }
  if (has(sql, "SELECT id, status FROM orders WHERE id = ? LIMIT 1")) return [[{ id: s.order.id, status: s.order.status }]];
  if (has(sql, "FROM testing_records WHERE production_id = ?")) {
    const r = s.runs.find((x) => x.id === params[0]);
    return [[{ tested: r.tested, failed: r.failed }]];
  }
  if (has(sql, "FROM quality_control_records WHERE production_id = ?")) {
    const r = s.runs.find((x) => x.id === params[0]);
    return [[{ inspected: r.inspected, approved: r.approved }]];
  }
  if (has(sql, "SELECT id, quantity FROM finished_goods WHERE production_id = ?")) return [s.boxes.filter((b) => b.production_id === params[0]).sort((a, b) => b.id - a.id)];
  if (has(sql, "INSERT INTO finished_goods")) {
    const box = { id: s.boxes.length + 1, production_id: params[0], quantity: params[2], status: "PACKAGING" };
    s.boxes.push(box);
    return [{ insertId: box.id }];
  }
  if (has(sql, "SELECT DISTINCT order_id, product_id FROM order_items")) {
    return [s.runs.map((r) => ({
      product_id: r.product_id, target: String(r.target), completed: r.completed,
      boxed: s.boxes.filter((b) => b.production_id === r.id).reduce((n, b) => n + b.quantity, 0),
      shipped: s.boxes.filter((b) => b.production_id === r.id && b.status !== "PACKAGING").reduce((n, b) => n + b.quantity, 0),
    }))];
  }
  if (has(sql, "UPDATE orders SET status = ?") && has(sql, "status <> 'COMPLETED'")) { s.order.status = params[0]; return [{ affectedRows: 1 }]; }
  throw new Error(`fake db: unexpected SQL: ${sql}`);
}

const conn = { query: async (sql, p) => run(sql, p), release: () => {} };
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: { query: conn.query, getConnection: async () => conn } };
const fg = require("../src/modules/finished-goods/finished-goods.service.js");
const { statusFromRuns } = require("../src/modules/orders/order-status.js");

beforeEach(() => { s = fresh(); });

describe("finished goods per product", () => {
  it("boxes each product of the order separately (the second product is not blocked by the first)", async () => {
    await fg.createFinishedGood(31, 12, 3, conn, 5);
    expect(s.order.status).toBe("TESTING"); // sensors still not boxed
    await fg.createFinishedGood(32, 12, 2, conn, 5);
    expect(s.boxes.map((b) => [b.production_id, b.quantity])).toEqual([[31, 3], [32, 2]]);
    expect(s.order.status).toBe("PACKAGING"); // every product boxed
  });

  it("is idempotent: asking again for a fully boxed product creates nothing", async () => {
    await fg.createFinishedGood(31, 12, 3, conn, 5);
    const again = await fg.createFinishedGood(31, 12, 3, conn, 5);
    expect(s.boxes).toHaveLength(1);
    expect(again.message).toMatch(/already exist/);
  });

  it("boxes units approved in a later pass as a new batch of the same run, never more than the target", async () => {
    await fg.createFinishedGood(31, 12, 3, conn, 5);
    // 2 more controllers approved, built, tested and inspected
    Object.assign(s.runs[0], { target: 5, completed: 5, tested: 5, inspected: 5, approved: 5 });
    await fg.createFinishedGood(31, 12, 5, conn, 5); // asks for 5, only 2 are missing
    expect(s.boxes.filter((b) => b.production_id === 31).map((b) => b.quantity)).toEqual([3, 2]);
  });

  it("refuses to box a product that is not fully built, tested and approved", async () => {
    s.runs[1].completed = 1;
    await expect(fg.createFinishedGood(32, 12, 2, conn, 5)).rejects.toMatchObject({ status: 409 });
    s.runs[1].completed = 2; s.runs[1].failed = 1;
    await expect(fg.createFinishedGood(32, 12, 2, conn, 5)).rejects.toMatchObject({ status: 409 });
    expect(s.boxes).toHaveLength(0);
  });
});

describe("order status from all products", () => {
  const r = (target, completed, boxed, shipped) => ({ target, completed, boxed, shipped });
  it("follows the slowest product", () => {
    expect(statusFromRuns([r(3, 3, 3, 3), r(2, 1, 0, 0)])).toBe("IN_PRODUCTION");
    expect(statusFromRuns([r(3, 3, 3, 0), r(2, 2, 0, 0)])).toBe("TESTING");
    expect(statusFromRuns([r(3, 3, 3, 0), r(2, 2, 2, 0)])).toBe("PACKAGING");
    expect(statusFromRuns([r(3, 3, 3, 3), r(2, 2, 2, 1)])).toBe("PACKAGING");
    expect(statusFromRuns([r(3, 3, 3, 3), r(2, 2, 2, 2)])).toBe("DISPATCHED");
  });
  it("a product approved but not started yet counts as still to build", () => {
    expect(statusFromRuns([r(3, 3, 3, 3), r(2, 0, 0, 0)])).toBe("IN_PRODUCTION");
  });
  it("products with nothing approved are ignored; nothing approved at all changes nothing", () => {
    expect(statusFromRuns([r(3, 3, 3, 3), r(0, 0, 0, 0)])).toBe("DISPATCHED");
    expect(statusFromRuns([r(0, 0, 0, 0)])).toBe(null);
  });
});

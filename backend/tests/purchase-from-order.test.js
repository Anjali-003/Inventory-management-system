/**
 * Purchase Manager can only buy what the Operations Admin sent (order_purchase_items).
 *   npm test
 * MySQL is replaced by a tiny in-memory fake that understands only the queries purchase.service sends.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

let s;
const fresh = () => ({
  orders: [
    { id: 7, approval_status: "APPROVED" },
    { id: 8, approval_status: "PENDING_APPROVAL" },
  ],
  // the Operations Admin's list
  requests: [
    { id: 1, order_id: 7, component_id: 11, quantity: "8.00", purchase_order_id: null },
    { id: 2, order_id: 7, component_id: 12, quantity: "3.50", purchase_order_id: null },
    { id: 3, order_id: 8, component_id: 13, quantity: "5.00", purchase_order_id: null },
  ],
  pos: [],
  poItems: [],
});

const norm = (sql) => sql.replace(/\s+/g, " ");
const has = (sql, t) => norm(sql).includes(t);

function run(sql, p = []) {
  if (has(sql, "SELECT id, approval_status FROM orders WHERE id = ? FOR UPDATE")) return [s.orders.filter((o) => o.id === p[0])];
  if (has(sql, "FROM order_purchase_items WHERE id IN (?) FOR UPDATE")) return [s.requests.filter((r) => p[0].includes(r.id))];
  if (has(sql, "INSERT INTO purchase_orders")) {
    const id = s.pos.length + 1;
    s.pos.push({ id, order_id: p[0], supplier: p[1], notes: p[2], status: "ORDER_PLACED", created_by: p[3] });
    return [{ insertId: id }];
  }
  if (has(sql, "UPDATE purchase_orders SET po_number")) { s.pos.find((x) => x.id === p[1]).po_number = p[0]; return [{}]; }
  if (has(sql, "INSERT INTO purchase_order_items")) { s.poItems.push({ po: p[0], component_id: p[1], quantity_ordered: p[2] }); return [{}]; }
  if (has(sql, "UPDATE order_purchase_items SET purchase_order_id")) { s.requests.find((r) => r.id === p[1]).purchase_order_id = p[0]; return [{}]; }
  if (has(sql, "FROM purchase_orders po") && has(sql, "WHERE po.id = ?")) return [s.pos.filter((x) => x.id === p[0]).map((x) => ({ ...x }))];
  if (has(sql, "FROM purchase_order_items i")) return [s.poItems.filter((i) => p[0].includes(i.po)).map((i) => ({ ...i, purchase_order_id: i.po, quantity_defective: 0 }))];
  throw new Error("fake db: unexpected query: " + norm(sql).slice(0, 120));
}
const conn = { query: async (sql, p) => run(sql, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: { query: conn.query, getConnection: async () => conn } };
const service = require("../src/modules/purchase/purchase.service.js");

const body = (extra = {}) => ({ order_id: 7, supplier: "Sharma Electronics", request_item_ids: [1, 2], ...extra });

beforeEach(() => { s = fresh(); });

describe("createPurchase", () => {
  it("orders exactly the components and quantities the Operations Admin sent", async () => {
    await service.createPurchase(body(), 99);
    expect(s.pos).toHaveLength(1);
    expect(s.pos[0]).toMatchObject({ order_id: 7, supplier: "Sharma Electronics", status: "ORDER_PLACED", po_number: "PO-0001" });
    expect(s.poItems).toEqual([
      { po: 1, component_id: 11, quantity_ordered: "8.00" },
      { po: 1, component_id: 12, quantity_ordered: "3.50" },
    ]);
    expect(s.requests.filter((r) => r.order_id === 7).every((r) => r.purchase_order_id === 1)).toBe(true);
  });

  it("can order only some lines now and the rest later (another supplier)", async () => {
    await service.createPurchase(body({ request_item_ids: [1] }), 99);
    expect(s.requests.map((r) => r.purchase_order_id)).toEqual([1, null, null]);
    await service.createPurchase(body({ request_item_ids: [2], supplier: "Delhi Components" }), 99);
    expect(s.requests.map((r) => r.purchase_order_id)).toEqual([1, 2, null]);
  });

  it("ignores any component / quantity typed by the client", async () => {
    await service.createPurchase(body({ items: [{ component_id: 999, quantity: 100000 }], request_item_ids: [1] }), 99);
    expect(s.poItems).toEqual([{ po: 1, component_id: 11, quantity_ordered: "8.00" }]);
  });

  it("refuses a free purchase with no list line", async () => {
    await expect(service.createPurchase({ supplier: "X Traders", order_id: 7, items: [{ component_id: 11, quantity: 5 }] }, 99)).rejects.toMatchObject({ status: 422 });
    await expect(service.createPurchase(body({ request_item_ids: [] }), 99)).rejects.toMatchObject({ status: 422 });
    expect(s.pos).toHaveLength(0);
  });

  it("refuses a line that belongs to another order", async () => {
    await expect(service.createPurchase(body({ request_item_ids: [3] }), 99)).rejects.toMatchObject({ code: "NOT_ON_LIST" });
    expect(s.pos).toHaveLength(0);
  });

  it("refuses a line that was already ordered (no double purchase)", async () => {
    await service.createPurchase(body({ request_item_ids: [1] }), 99);
    await expect(service.createPurchase(body({ request_item_ids: [1, 2] }), 99)).rejects.toMatchObject({ status: 409, code: "ALREADY_ORDERED" });
    expect(s.pos).toHaveLength(1); // nothing from the second request was saved
  });

  it("refuses an order that is not approved", async () => {
    await expect(service.createPurchase(body({ order_id: 8, request_item_ids: [3] }), 99)).rejects.toMatchObject({ status: 409, code: "NOT_APPROVED" });
  });

  it("accepts a long list (a big BOM can be short on far more than 50 components)", async () => {
    s.requests = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, order_id: 7, component_id: 100 + i, quantity: "1.00", purchase_order_id: null }));
    await service.createPurchase(body({ request_item_ids: s.requests.map((r) => r.id) }), 99);
    expect(s.poItems).toHaveLength(150);
    expect(s.requests.every((r) => r.purchase_order_id === 1)).toBe(true);
  });

  it("validates supplier and duplicate ids", async () => {
    await expect(service.createPurchase(body({ supplier: " " }), 99)).rejects.toMatchObject({ status: 422 });
    await expect(service.createPurchase(body({ request_item_ids: [1, 1] }), 99)).rejects.toMatchObject({ status: 422 });
  });
});

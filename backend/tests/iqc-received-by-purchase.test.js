/**
 * The purchase manager counts what arrived (receive); IQC only says how many of those pieces are rejected.
 *   npm test
 * MySQL is replaced by a tiny in-memory fake that understands only the queries these two steps send.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

let s;
const fresh = () => ({
  po: { id: 1, po_number: "PO-0001", status: "ORDER_PLACED" },
  items: [
    { id: 10, purchase_order_id: 1, quantity_ordered: "100.00", quantity_received: null },
    { id: 11, purchase_order_id: 1, quantity_ordered: "50.00", quantity_received: null },
  ],
  saved: {},
});

const norm = (sql) => sql.replace(/\s+/g, " ");
const has = (sql, t) => norm(sql).includes(t);

function run(sql, p = []) {
  if (has(sql, "SELECT id, po_number, status FROM purchase_orders WHERE id = ? FOR UPDATE")) return [[{ ...s.po }]];
  if (has(sql, "SET quantity_received = quantity_ordered")) { s.items.forEach((i) => { i.quantity_received = i.quantity_ordered; }); return [{}]; }
  if (has(sql, "UPDATE purchase_order_items SET quantity_received = ? WHERE id = ?")) { s.items.find((i) => i.id === p[1]).quantity_received = p[0]; return [{}]; }
  if (has(sql, "COALESCE(quantity_received, quantity_ordered) AS received")) return [s.items.map((i) => ({ id: i.id, received: i.quantity_received ?? i.quantity_ordered }))];
  if (has(sql, "SELECT id FROM purchase_order_items WHERE purchase_order_id = ?")) return [s.items.map((i) => ({ id: i.id }))];
  if (has(sql, "UPDATE purchase_order_items SET quantity_received = ?, quantity_defective = ?")) {
    s.saved[p[5]] = { received: p[0], defective: p[1], approved: p[2], decision: p[3], remarks: p[4] };
    return [{}];
  }
  if (has(sql, "UPDATE purchase_orders SET status = ?")) { s.po.status = p[0]; return [{}]; }
  if (has(sql, "FROM purchase_orders po")) return [[{ ...s.po }]];
  if (has(sql, "FROM purchase_order_items i")) return [[]];
  if (has(sql, "FROM order_purchase_items")) return [[]];
  throw new Error("fake db: unexpected query: " + norm(sql).slice(0, 120));
}
const conn = { query: async (sql, p) => run(sql, p), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: { query: conn.query, getConnection: async () => conn } };
require.cache[require.resolve("../src/modules/notifications/notification.service.js")] = {
  id: "n", filename: "n", loaded: true, exports: { notify: async () => {}, notifyCommitted: () => {} },
};
const purchases = require("../src/modules/purchase/purchase.service.js");
const iqc = require("../src/modules/iqc/iqc.service.js");

beforeEach(() => { s = fresh(); });

describe("markReceived", () => {
  it("saves the counts the purchase manager typed", async () => {
    await purchases.markReceived(1, { items: [{ id: 10, received: "98" }, { id: 11, received: "50" }] }, 5);
    expect(s.items.map((i) => i.quantity_received)).toEqual(["98.00", "50.00"]);
  });

  it("without counts, everything ordered counts as received", async () => {
    await purchases.markReceived(1, {}, 5);
    expect(s.items.map((i) => i.quantity_received)).toEqual(["100.00", "50.00"]);
  });

  it("needs every component and something received", async () => {
    await expect(purchases.markReceived(1, { items: [{ id: 10, received: "98" }] }, 5)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(purchases.markReceived(1, { items: [{ id: 10, received: "0" }, { id: 11, received: "0" }] }, 5)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("IQC inspect", () => {
  beforeEach(() => {
    s.po.status = "PENDING_IQC";
    s.items[0].quantity_received = "98.00";
    s.items[1].quantity_received = "50.00";
  });

  it("accepted = received - rejected; a component with nothing accepted is rejected", async () => {
    await iqc.inspect(1, { items: [{ id: 10, rejected: "8", remarks: "cracked" }, { id: 11, rejected: "50", remarks: "wrong spec" }] }, 6);
    expect(s.saved[10]).toMatchObject({ received: "98.00", defective: "8.00", approved: "90.00", decision: "APPROVED" });
    expect(s.saved[11]).toMatchObject({ received: "50.00", defective: "50.00", approved: "0.00", decision: "REJECTED" });
    expect(s.po.status).toBe("PENDING_STORE");
  });

  it("nothing accepted rejects the purchase", async () => {
    await iqc.inspect(1, { items: [{ id: 10, rejected: "98", remarks: "x" }, { id: 11, rejected: "50", remarks: "x" }] }, 6);
    expect(s.po.status).toBe("REJECTED");
  });

  it("cannot reject more than received, and rejected pieces need a reason", async () => {
    await expect(iqc.inspect(1, { items: [{ id: 10, rejected: "99", remarks: "x" }, { id: 11, rejected: "0" }] }, 6)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(iqc.inspect(1, { items: [{ id: 10, rejected: "5" }, { id: 11, rejected: "0" }] }, 6)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

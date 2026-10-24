/**
 * Quantity revision: the Operations Admin makes only part of an order, the Marketing Manager accepts it.
 *   order-approvals revise()          PENDING_APPROVAL -> QUANTITY_REVISED, split into original + held-back draft
 *   marketing-orders acceptRevision() QUANTITY_REVISED -> PENDING_APPROVAL
 * MySQL is replaced by an in-memory fake that understands only the queries these two functions send.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

let s;
const fresh = () => ({
  orders: [{ id: 7, order_number: "ORD-007", approval_status: "PENDING_APPROVAL", revision: null, created_by: 3, creator_role: "MARKETING_MANAGER", estimated_delivery_date: "2026-11-30" }],
  items: [
    { id: 1, order_id: 7, product_id: 1, sku: "PRD-001", name: "Smart Controller", quantity: "100.00" },
    { id: 2, order_id: 7, product_id: 2, sku: "PRD-002", name: "Sensor", quantity: "40.00" },
  ],
  // one component per product, one per unit; enough stock for the whole order unless a test lowers it
  bom: [
    { product_id: 1, component_id: 1, quantity_required: "1.00", sku: "CMP-001", name: "Board", unit: "pcs" },
    { product_id: 2, component_id: 2, quantity_required: "1.00", sku: "CMP-002", name: "Probe", unit: "pcs" },
  ],
  inventory: [
    { component_id: 1, quantity_on_hand: "100.00", quantity_reserved: "0.00" },
    { component_id: 2, quantity_on_hand: "40.00", quantity_reserved: "0.00" },
  ],
  nextOrderId: 8,
  nextItemId: 3,
  notifications: [],
});

const has = (sql, text) => sql.replace(/\s+/g, " ").includes(text);
const orderById = (id) => s.orders.find((o) => o.id === id);

function run(sql, p = []) {
  if (has(sql, "u.role AS creator_role FROM orders o LEFT JOIN users u")) return [orderById(p[0]) ? [{ ...orderById(p[0]) }] : []];
  if (has(sql, "FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")) return [s.items.filter((i) => i.order_id === p[0])];
  if (has(sql, "FROM product_bom pb")) return [s.bom.filter((b) => p[0].includes(b.product_id))];
  if (has(sql, "FROM inventory WHERE component_id IN")) return [s.inventory.filter((r) => p[0].includes(r.component_id))];
  if (has(sql, "DELETE FROM order_items WHERE id = ?")) { s.items = s.items.filter((i) => i.id !== p[0]); return [{ affectedRows: 1 }]; }
  if (has(sql, "UPDATE order_items SET quantity = ?")) { s.items.find((i) => i.id === p[1]).quantity = String(p[0]); return [{ affectedRows: 1 }]; }
  if (has(sql, "INSERT INTO orders")) {
    const [order_number, parent_order_id, estimated_delivery_date, created_by] = p;
    s.orders.push({ id: s.nextOrderId, order_number, parent_order_id, approval_status: "DRAFT", revision: null, created_by, creator_role: "MARKETING_MANAGER", estimated_delivery_date });
    return [{ insertId: s.nextOrderId++ }];
  }
  if (has(sql, "INSERT INTO order_items (order_id, product_id, quantity) VALUES ?")) {
    for (const [order_id, product_id, quantity] of p[0]) s.items.push({ id: s.nextItemId++, order_id, product_id, quantity: String(quantity) });
    return [{ affectedRows: p[0].length }];
  }
  if (has(sql, "SET approval_status = 'QUANTITY_REVISED'")) {
    Object.assign(orderById(p[2]), { approval_status: "QUANTITY_REVISED", revision: p[0], revised_by: p[1] });
    return [{ affectedRows: 1 }];
  }
  if (has(sql, "SET approval_status = 'PENDING_APPROVAL', revision_accepted_by")) {
    Object.assign(orderById(p[1]), { approval_status: "PENDING_APPROVAL", revision_accepted_by: p[0] });
    return [{ affectedRows: 1 }];
  }
  if (has(sql, "DATE_FORMAT(estimated_delivery_date, '%Y-%m-%d') AS old_date")) {
    const o = orderById(p[0]);
    return [o ? [{ id: o.id, order_number: o.order_number, approval_status: o.approval_status, old_date: o.estimated_delivery_date }] : []];
  }
  if (has(sql, "UPDATE orders SET estimated_delivery_date = ?")) { orderById(p[1]).estimated_delivery_date = p[0]; return [{ affectedRows: 1 }]; }
  if (has(sql, "INSERT INTO notifications")) {
    const [role, type, title, body, severity, link, requires_action, order_id] = p;
    s.notifications.push({ id: s.notifications.length + 1, role, type, title, body, severity, link, requires_action, order_id });
    return [{ insertId: s.notifications.length }];
  }
  // getOrder(): the order row, its lines, and no production / purchase hand-overs yet
  if (has(sql, "FROM orders o LEFT JOIN users cu")) return [orderById(p[0]) ? [{ ...orderById(p[0]) }] : []];
  if (has(sql, "FROM order_items oi") && has(sql, "oi.order_id IN")) return [s.items.filter((i) => p[0].includes(i.order_id))];
  if (has(sql, "FROM order_production_items r") || has(sql, "FROM order_purchase_items r")) return [[]];
  throw new Error("fake db: unexpected query: " + sql.replace(/\s+/g, " ").slice(0, 120));
}

const fakeDb = {
  query: async (sql, p) => run(sql, p),
  getConnection: async () => {
    let snapshot;
    return {
      query: async (sql, p) => run(sql, p),
      beginTransaction: async () => { snapshot = structuredClone(s); },
      commit: async () => {},
      rollback: async () => { s = snapshot; },
      release: () => {},
    };
  },
};

require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const approvals = require("../src/modules/order-approvals/order-approval.service.js");
const marketing = require("../src/modules/marketing-orders/marketing-order.service.js");
const hub = require("../src/realtime/hub.js");
let pushes = [];
hub.notifyRole = (role, data) => pushes.push({ role, ...data });

beforeEach(() => {
  s = fresh();
  pushes = [];
});

const qtyOf = (orderId) => Object.fromEntries(s.items.filter((i) => i.order_id === orderId).map((i) => [i.product_id, Number(i.quantity)]));

describe("Operations Admin revises the quantity", () => {
  it("splits the order: the original keeps what will be made, the rest becomes a marketing draft", async () => {
    const order = await approvals.revise(7, { remarks: "Only 60 now, line is busy", items: [{ product_id: 1, quantity: 60 }] }, 5);

    expect(order.approval_status).toBe("QUANTITY_REVISED");
    expect(qtyOf(7)).toEqual({ 1: 60, 2: 40 }); // product 2 left out of the list -> keeps its full quantity

    const held = s.orders.find((o) => o.parent_order_id === 7);
    expect(held).toMatchObject({ order_number: "ORD-007-H", approval_status: "DRAFT", created_by: 3, estimated_delivery_date: "2026-11-30" });
    expect(qtyOf(held.id)).toEqual({ 1: 40 });

    expect(order.revision).toMatchObject({ remarks: "Only 60 now, line is busy", held_order_id: held.id, held_order_number: "ORD-007-H" });
    expect(order.revision.items).toEqual([
      { product_id: 1, sku: "PRD-001", name: "Smart Controller", requested: 100, approved: 60, held: 40 },
      { product_id: 2, sku: "PRD-002", name: "Sensor", requested: 40, approved: 40, held: 0 },
    ]);
    expect(pushes).toEqual([expect.objectContaining({ role: "MARKETING_MANAGER", type: "QUANTITY_REVISED", severity: "action", link: "/marketing-orders?order=7" })]);
    // saved too, so it is still in the bell if the Marketing Manager was offline
    expect(s.notifications).toEqual([expect.objectContaining({ role: "MARKETING_MANAGER", type: "QUANTITY_REVISED", order_id: 7 })]);
  });

  it("removes a product brought down to 0 from the original; it lives only in the held-back draft", async () => {
    await approvals.revise(7, { remarks: "No sensors this month", items: [{ product_id: 1, quantity: 100 }, { product_id: 2, quantity: 0 }] }, 5);
    expect(qtyOf(7)).toEqual({ 1: 100 });
    expect(qtyOf(8)).toEqual({ 2: 40 });
  });

  it("refuses what makes no sense, and changes nothing", async () => {
    const tries = [
      [{ items: [{ product_id: 1, quantity: 50 }] }, "VALIDATION"], // no reason
      [{ remarks: "same", items: [{ product_id: 1, quantity: 100 }] }, "VALIDATION"], // nothing reduced
      [{ remarks: "none", items: [{ product_id: 1, quantity: 0 }, { product_id: 2, quantity: 0 }] }, "VALIDATION"], // makes nothing: reject instead
      [{ remarks: "more", items: [{ product_id: 1, quantity: 120 }] }, "VALIDATION"], // more than ordered
      [{ remarks: "half", items: [{ product_id: 1, quantity: 10.5 }] }, "VALIDATION"],
      [{ remarks: "other", items: [{ product_id: 9, quantity: 1 }] }, "VALIDATION"], // not in the order
    ];
    for (const [body, code] of tries) {
      await expect(approvals.revise(7, body, 5)).rejects.toMatchObject({ code });
    }
    expect(s).toEqual(fresh());
  });

  it("only allows what the stock on the shelf can build now", async () => {
    s.inventory[0].quantity_on_hand = "50.00"; // 50 boards -> at most 50 Smart Controllers
    await expect(approvals.revise(7, { remarks: "60 now", items: [{ product_id: 1, quantity: 60 }] }, 5))
      .rejects.toMatchObject({ code: "NOT_ENOUGH_STOCK", extra: { lines: [{ product_id: 1, can_make: 50 }] } });
    expect(s.orders).toHaveLength(1); // nothing split, nothing changed
    expect(qtyOf(7)).toEqual({ 1: 100, 2: 40 });

    const order = await approvals.revise(7, { remarks: "50 now", items: [{ product_id: 1, quantity: 50 }] }, 5);
    expect(order.approval_status).toBe("QUANTITY_REVISED");
    expect(qtyOf(8)).toEqual({ 1: 50 });
  });

  it("only revises a waiting marketing order, and only once", async () => {
    await approvals.revise(7, { remarks: "60 now", items: [{ product_id: 1, quantity: 60 }] }, 5);
    await expect(approvals.revise(7, { remarks: "50 now", items: [{ product_id: 1, quantity: 50 }] }, 5)).rejects.toMatchObject({ code: "ALREADY_DECIDED" });

    s = fresh();
    s.orders[0].creator_role = "SUPER_ADMIN";
    await expect(approvals.revise(7, { remarks: "60 now", items: [{ product_id: 1, quantity: 60 }] }, 5)).rejects.toMatchObject({ code: "NOT_MARKETING_ORDER" });
  });
});

describe("Marketing Manager accepts the revised quantity", () => {
  it("sends the order back to the admin's queue and tells the Operations Admin", async () => {
    await approvals.revise(7, { remarks: "60 now", items: [{ product_id: 1, quantity: 60 }] }, 5);
    pushes = [];

    const order = await marketing.acceptRevision(7, 3);
    expect(order.approval_status).toBe("PENDING_APPROVAL");
    expect(s.orders[0].revision_accepted_by).toBe(3);
    expect(qtyOf(7)).toEqual({ 1: 60, 2: 40 });
    expect(pushes).toEqual([expect.objectContaining({ role: "OPERATIONS_ADMIN", type: "REVISION_ACCEPTED" })]);

    await expect(marketing.acceptRevision(7, 3)).rejects.toMatchObject({ code: "NOT_REVISED" });
  });
});

describe("Operations Admin changes the expected delivery date", () => {
  it("saves the date and notifies the Marketing Manager (saved + live), linking to the order", async () => {
    await approvals.updateDeliveryDate(7, { estimated_delivery_date: "2026-12-15", reason: "Supplier delay" }, { id: 5 });

    expect(s.orders[0].estimated_delivery_date).toBe("2026-12-15");
    expect(s.notifications).toEqual([
      expect.objectContaining({
        role: "MARKETING_MANAGER",
        type: "DELIVERY_DATE_CHANGED",
        title: "Delivery date changed for order ORD-007",
        body: "30 Nov 2026 → 15 Dec 2026 · Supplier delay",
        severity: "warning",
        link: "/marketing-orders?order=7",
        order_id: 7,
      }),
    ]);
    expect(pushes).toEqual([expect.objectContaining({ role: "MARKETING_MANAGER", type: "DELIVERY_DATE_CHANGED", link: "/marketing-orders?order=7" })]);
  });

  it("sends nothing when the date did not actually change", async () => {
    await approvals.updateDeliveryDate(7, { estimated_delivery_date: "2026-11-30" }, { id: 5 });
    expect(s.notifications).toEqual([]);
    expect(pushes).toEqual([]);
  });
});

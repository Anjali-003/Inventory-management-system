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
  order: { id: 7, order_number: "ORD-007", status: "PENDING", approval_status: "PENDING_APPROVAL", approval_remarks: null, approval_round: 0 },
  items: [{ product_id: 1, sku: "PRD-001", name: "Smart Controller", quantity: "10.00" }],
  bom: [
    { product_id: 1, component_id: 1, quantity_required: "2.00", sku: "CMP-001", name: "Resistor", unit: "pcs" },
    { product_id: 1, component_id: 2, quantity_required: "1.00", sku: "CMP-002", name: "Capacitor", unit: "pcs" },
  ],
  inventory: [
    { component_id: 1, quantity_on_hand: "15.00", quantity_reserved: "3.00" }, // 12 available -> 6 units
    { component_id: 2, quantity_on_hand: "100.00", quantity_reserved: "0.00" },
  ],
  ledger: [],
  notifications: [], // "issue these components" rows for the Store Manager
  productionRows: [],
  purchaseRows: [],
  idem: [], // idempotency_keys table
  ledgerError: null, // set a test to make the next ledger INSERT fail (e.g. the UNIQUE key firing)
  failLedgerOnNth: 0, // n: the n-th ledger row of the transaction fails (after the earlier rows were already written)
  orderUpdateErrors: [], // errors thrown by the next UPDATE orders calls, one per call (e.g. a deadlock)
  orderUpdateRows: 1, // affectedRows answered by UPDATE orders (0 = the status row did not land)
  locks: 0,
});

const has = (sql, text) => sql.replace(/\s+/g, " ").includes(text);
function run(sql, params = []) {
  if (has(sql, "SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE")) { s.locks++; return [s.order.id === params[0] ? [{ ...s.order }] : []]; }
  // units approved in earlier passes (summed per product), so a later pass only plans what is still open
  if (has(sql, "FROM order_production_items WHERE order_id = ? GROUP BY product_id")) {
    const sums = new Map();
    for (const [order_id, product_id, quantity] of s.productionRows) {
      if (order_id === params[0]) sums.set(product_id, (sums.get(product_id) || 0) + Number(quantity));
    }
    return [[...sums].map(([product_id, approved]) => ({ product_id, approved }))];
  }
  if (has(sql, "SELECT approval_status, approval_round FROM orders WHERE id = ?")) return [s.order.id === params[0] ? [{ approval_status: s.order.approval_status, approval_round: s.order.approval_round }] : []];
  if (has(sql, "FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")) return [s.items.filter((item) => (item.order_id || s.order.id) === params[0])];
  if (has(sql, "FROM order_items oi") && has(sql, "oi.order_id IN")) return [s.items.map((i) => ({ ...i, order_id: i.order_id || s.order.id }))];
  if (has(sql, "FROM product_bom pb")) return [s.bom];
  if (has(sql, "FROM inventory WHERE component_id IN")) { if (has(sql, "FOR UPDATE")) s.locks++; return [s.inventory]; }
  if (has(sql, "UPDATE inventory SET quantity_on_hand = quantity_on_hand -")) {
    const row = s.inventory.find((item) => item.component_id === params[1]);
    if (!row || Number(row.quantity_on_hand) - Number(row.quantity_reserved) < Number(params[2])) return [{ affectedRows: 0 }];
    row.quantity_on_hand = (Number(row.quantity_on_hand) - Number(params[0])).toFixed(2);
    return [{ affectedRows: 1 }];
  }
  if (has(sql, "SELECT quantity_on_hand FROM inventory WHERE component_id = ?")) {
    const row = s.inventory.find((item) => item.component_id === params[0]);
    return [row ? [{ quantity_on_hand: row.quantity_on_hand }] : []];
  }
  if (has(sql, "INSERT INTO inventory_transactions")) {
    if (s.ledgerError) throw s.ledgerError;
    if (s.failLedgerOnNth && s.ledger.length + 1 === s.failLedgerOnNth) throw new Error("ledger write failed");
    s.ledger.push({ params, sql });
    return [{ insertId: s.ledger.length }];
  }
  if (has(sql, "SELECT id, sku, name, unit FROM components WHERE id IN")) {
    const names = { 1: ["CMP-001", "Resistor"], 2: ["CMP-002", "Capacitor"] };
    return [params[0].map((id) => ({ id, sku: names[id][0], name: names[id][1], unit: "pcs" }))];
  }
  if (has(sql, "SELECT order_number FROM orders WHERE id = ?")) return [[{ order_number: s.order.order_number }]];
  if (has(sql, "INSERT INTO notifications")) {
    s.notifications.push({ id: s.notifications.length + 1, role: "STORE_MANAGER", type: params[0], title: params[1], order_id: params[2], payload: JSON.parse(params[3]) });
    return [{ insertId: s.notifications.length }];
  }
  if (has(sql, "UPDATE orders")) {
    if (s.orderUpdateErrors.length) throw s.orderUpdateErrors.shift();
    if (s.orderUpdateRows !== 1) return [{ affectedRows: s.orderUpdateRows }];
    s.order = { ...s.order, approval_status: params[0], approval_remarks: params[1], approval_round: params[3], inventory_issued_at: true };
    return [{ affectedRows: 1 }];
  }
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
/* idempotency_keys: idem_key is UNIQUE (errno 1062 like MySQL). Rows inserted by a transaction vanish if it rolls back. */
function idemQuery(sql, params, claims) {
  if (has(sql, "INSERT INTO idempotency_keys")) {
    const [idem_key, action, request_hash, user_id] = params;
    if (s.idem.some((row) => row.idem_key === idem_key)) throw Object.assign(new Error("Duplicate entry for key 'uq_idempotency_key'"), { errno: 1062 });
    const row = { id: s.idem.length + 1, idem_key, action, request_hash, user_id, response: null };
    s.idem.push(row);
    claims.push(row);
    return [{ insertId: row.id }];
  }
  if (has(sql, "SELECT request_hash, response FROM idempotency_keys")) {
    return [s.idem.filter((row) => row.idem_key === params[0]).map(({ request_hash, response }) => ({ request_hash, response }))];
  }
  if (has(sql, "UPDATE idempotency_keys SET response")) {
    s.idem.find((row) => row.id === params[1]).response = params[0];
    return [{ affectedRows: 1 }];
  }
  return null;
}
let transactionQueue = Promise.resolve();
const fakeDb = {
  query: async (sql, p) => run(sql, p),
  getConnection: async () => {
    let unlock;
    let snapshot;
    const claims = [];
    return {
      query: async (sql, p) => idemQuery(sql, p, claims) || run(sql, p),
      beginTransaction: async () => {
        const previous = transactionQueue;
        transactionQueue = new Promise((resolve) => { unlock = resolve; });
        await previous;
        const { order, inventory, ledger, notifications, productionRows, purchaseRows } = s;
        snapshot = structuredClone({ order, inventory, ledger, notifications, productionRows, purchaseRows });
      },
      commit: async () => unlock?.(),
      rollback: async () => {
        for (const row of claims) s.idem.splice(s.idem.indexOf(row), 1);
        if (snapshot) Object.assign(s, structuredClone(snapshot)); // a rolled-back transaction leaves no trace in ANY table
        unlock?.();
      },
      release: () => {},
    };
  },
};

require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const rawService = require("../src/modules/order-approvals/order-approval.service.js");
// live pushes to the Store Managers: record them instead of writing to real browser connections
const hub = require("../src/realtime/hub.js");
let pushes = [];
hub.notifyRole = (role, data) => pushes.push({ role, ...data });

// approve() and dispatch() REQUIRE an idempotency_key and the expected_round. The tests in this file are about planning
// and stock, so they call the service through a client that sends a fresh key and the round it just saw. The tests in
// "duplicate requests never deduct twice" (bottom of the file) call rawService to test the guard itself.
let keyCounter = 0;
const asClient = (fn) => (orderId, body = {}, userId, opts) =>
  fn(orderId, { idempotency_key: `test-key-${++keyCounter}`, expected_round: s.order.approval_round, ...body }, userId, opts);
const service = { ...rawService, approve: asClient(rawService.approve), dispatch: asClient(rawService.dispatch) };

const rightLists = () => ({
  production_items: [{ product_id: 1, quantity: 6 }],
  purchase_items: [{ component_id: 1, quantity: 8 }],
});

beforeEach(() => { s = fresh(); pushes = []; });

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
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(s.purchaseRows).toEqual([[7, 1, 8, 5]]);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["3.00", "94.00"]);
    expect(s.ledger).toHaveLength(2);
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
    expect(s.order.approval_status).toBe("APPROVED");
  });

  it("allocates and issues BOM materials for each approved product line", async () => {
    s.items = [
      { order_id: 7, product_id: 1, sku: "PRD-001", name: "Controller", quantity: "2.00" },
      { order_id: 7, product_id: 2, sku: "PRD-002", name: "Sensor", quantity: "3.00" },
    ];
    s.bom = [
      { product_id: 1, component_id: 1, quantity_required: "2.00" },
      { product_id: 2, component_id: 1, quantity_required: "1.00" },
      { product_id: 2, component_id: 2, quantity_required: "1.00" },
    ];
    s.inventory = [
      { component_id: 1, quantity_on_hand: "20.00", quantity_reserved: "0.00" },
      { component_id: 2, quantity_on_hand: "20.00", quantity_reserved: "0.00" },
    ];
    await service.dispatch(7, {
      production_items: [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 3 }],
      purchase_items: [],
    }, 5);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["13.00", "17.00"]);
    expect(s.productionRows).toEqual([[7, 1, 2, 5], [7, 2, 3, 5]]);
  });

  it("issues only the BOM for the quantity the admin selected", async () => {
    await service.dispatch(7, {
      production_items: [{ product_id: 1, quantity: 2 }],
      purchase_items: [{ component_id: 1, quantity: 8 }],
    }, 5);
    expect(s.productionRows).toEqual([[7, 1, 2, 5]]);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["11.00", "98.00"]);
    expect(s.ledger).toHaveLength(2);
    expect(s.ledger.every((entry) => entry.sql.includes("'ISSUED_TO_PRODUCTION'"))).toBe(true);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
  });
});

describe("approve", () => {
  it("consumes the planned BOM stock once and records approved production quantities", async () => {
    const result = await service.approve(7, { remarks: "approved" }, 5);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
    expect(s.order.inventory_issued_at).toBe(true);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["3.00", "94.00"]);
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(result.production_request.items[0]).toMatchObject({ product_id: 1, quantity: 6 });
  });

  it("does not oversell when admins approve separate orders concurrently", async () => {
    const secondOrder = { id: 8, order_number: "ORD-008", status: "PENDING", approval_status: "PENDING_APPROVAL" };
    s.items.push({ order_id: 8, product_id: 1, sku: "PRD-001", name: "Smart Controller", quantity: "10.00" });
    // Keep the fake's second order isolated while both orders share the same inventory rows.
    const originalConnQuery = fakeDb.getConnection;
    fakeDb.getConnection = async () => {
      const connection = await originalConnQuery();
      const query = connection.query;
      connection.query = async (sql, params = []) => {
        if (has(sql, "SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE") && params[0] === 8) return [[{ ...secondOrder }]];
        if (has(sql, "FROM order_production_items WHERE order_id = ? GROUP BY product_id") && params[0] === 8) return [[]];
        if (has(sql, "FROM order_items oi JOIN products p ON p.id = p.id")) return query(sql, params);
        if (has(sql, "FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?") && params[0] === 8) return [s.items.filter((item) => item.order_id === 8)];
        if (has(sql, "UPDATE orders") && params[4] === 8) { Object.assign(secondOrder, { approval_status: params[0] }); return [{ affectedRows: 1 }]; }
        if (has(sql, "FROM orders o LEFT JOIN users cu") && params[0] === 8) return [[{ ...secondOrder, created_by_name: "Marketing", approved_by_name: "Ops" }]];
        return query(sql, params);
      };
      return connection;
    };
    try {
      const results = await Promise.allSettled([
        service.approve(7, {}, 5),
        service.approve(8, {}, 6),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
      expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
      expect(secondOrder.approval_status).toBe("PARTIALLY_APPROVED");
      expect(s.productionRows.reduce((sum, row) => sum + Number(row[2]), 0)).toBe(6);
      expect(s.inventory[0].quantity_on_hand).toBe("3.00");
      expect(Number(s.inventory[0].quantity_on_hand)).toBeGreaterThanOrEqual(Number(s.inventory[0].quantity_reserved));
    } finally {
      fakeDb.getConnection = originalConnQuery;
    }
  });
});

/* ---- partial approval, then approving the rest ----------------------------------------------------------------- */
describe("approving the rest of a partly approved order", () => {
  // First pass: 10 ordered, stock allows 6 -> PARTIALLY_APPROVED, 8 x CMP-001 sent to the Purchase Manager.
  const firstPass = () => service.dispatch(7, rightLists(), 5);
  // The missing components arrive: 8 available -> 4 more units can be built.
  const stockArrives = () => { s.inventory[0].quantity_on_hand = "11.00"; };

  it("plans only the units that are not approved yet", async () => {
    await firstPass();
    stockArrives();
    const plan = await service.getPlan(7);
    expect(plan.reapproval).toBe(true);
    expect(plan.lines[0]).toMatchObject({ product_id: 1, ordered: 4, ordered_total: 10, already_approved: 6, can_make: 4, remaining: 0 });
    expect(plan.shortages).toEqual([]);
    expect(plan.fully_producible).toBe(true);
  });

  it("approves the rest: issues only those materials, becomes APPROVED, adds no purchase lines", async () => {
    await firstPass();
    stockArrives();
    const purchaseBefore = s.purchaseRows.length;
    const order = await service.dispatch(7, { production_items: [{ product_id: 1, quantity: 4 }], purchase_items: [] }, 5);

    expect(s.order.approval_status).toBe("APPROVED");
    expect(s.order.approval_round).toBe(2);
    expect(s.productionRows).toEqual([[7, 1, 6, 5], [7, 1, 4, 5]]);
    expect(s.purchaseRows).toHaveLength(purchaseBefore);
    // 4 more units = 8 x CMP-001 and 4 x CMP-002 on top of the first pass (6 units)
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["3.00", "90.00"]);
    // the screen sees one line per product with both passes added up
    expect(order.production_request.items).toHaveLength(1);
    expect(order.production_request.items[0]).toMatchObject({ product_id: 1, quantity: 10 });
  });

  it("gives every approval pass its own ledger key, so passes never collide", async () => {
    await firstPass();
    stockArrives();
    await service.dispatch(7, { production_items: [{ product_id: 1, quantity: 4 }], purchase_items: [] }, 5);
    const keys = s.ledger.map((entry) => entry.params[entry.params.length - 1]);
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    expect(keys.filter((key) => key.startsWith("approval-7-1-"))).toHaveLength(2);
    expect(keys.filter((key) => key.startsWith("approval-7-2-"))).toHaveLength(2);
  });

  it("can approve the rest in several smaller passes and stays PARTIALLY_APPROVED until everything is approved", async () => {
    await firstPass();
    stockArrives();
    await service.dispatch(7, { production_items: [{ product_id: 1, quantity: 3 }], purchase_items: [] }, 5);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
    expect(s.order.approval_round).toBe(2);

    s.inventory[0].quantity_on_hand = "11.00"; // more arrives
    await service.dispatch(7, { production_items: [{ product_id: 1, quantity: 1 }], purchase_items: [] }, 5);
    expect(s.order.approval_status).toBe("APPROVED");
    expect(s.order.approval_round).toBe(3);
  });

  it("refuses to approve more than what stock allows (stale plan)", async () => {
    await firstPass();
    stockArrives();
    await expect(service.dispatch(7, { production_items: [{ product_id: 1, quantity: 5 }], purchase_items: [] }, 5))
      .rejects.toMatchObject({ status: 409, code: "STALE_PLAN" });
    expect(s.productionRows).toHaveLength(1);
  });

  it("needs at least one product quantity when approving the rest", async () => {
    await firstPass();
    stockArrives();
    await expect(service.dispatch(7, { production_items: [], purchase_items: [{ component_id: 1, quantity: 1 }] }, 5))
      .rejects.toMatchObject({ status: 422 });
  });

  it("approve() with nothing buildable yet is refused and saves nothing", async () => {
    await firstPass(); // stock is used up: 0 available
    const ledgerBefore = s.ledger.length;
    await expect(service.approve(7, {}, 5)).rejects.toMatchObject({ status: 409, code: "NOTHING_TO_APPROVE" });
    expect(s.ledger).toHaveLength(ledgerBefore);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
  });

  it("approve() approves the rest once stock is there", async () => {
    await firstPass();
    stockArrives();
    await service.approve(7, {}, 5);
    expect(s.order.approval_status).toBe("APPROVED");
    expect(s.productionRows).toEqual([[7, 1, 6, 5], [7, 1, 4, 5]]);
  });

  it("a partly approved order cannot be rejected", async () => {
    await firstPass();
    await expect(service.reject(7, { remarks: "no longer needed" }, 5)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECIDED" });
  });

  it("multi-product order: the second pass finishes only the product that is still open", async () => {
    s.items = [
      { order_id: 7, product_id: 1, sku: "PRD-001", name: "Controller", quantity: "2.00" },
      { order_id: 7, product_id: 2, sku: "PRD-002", name: "Sensor", quantity: "5.00" },
    ];
    s.bom = [
      { product_id: 1, component_id: 1, quantity_required: "2.00" },
      { product_id: 2, component_id: 1, quantity_required: "1.00" },
      { product_id: 2, component_id: 2, quantity_required: "1.00" },
    ];
    s.inventory = [
      { component_id: 1, quantity_on_hand: "6.00", quantity_reserved: "0.00" }, // controller 2 x 2 = 4, leaves 2 -> 2 sensors
      { component_id: 2, quantity_on_hand: "20.00", quantity_reserved: "0.00" },
    ];
    // first pass: both controllers and 2 of the 5 sensors; 3 sensors need 3 more CMP-001
    await service.dispatch(7, {
      production_items: [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 2 }],
      purchase_items: [{ component_id: 1, quantity: 3 }],
    }, 5);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");

    s.inventory[0].quantity_on_hand = "3.00";
    const plan = await service.getPlan(7);
    expect(plan.lines).toHaveLength(1); // the controller is fully approved: only the sensor is planned again
    expect(plan.lines[0]).toMatchObject({ product_id: 2, ordered: 3, ordered_total: 5, already_approved: 2, can_make: 3 });

    const order = await service.dispatch(7, { production_items: [{ product_id: 2, quantity: 3 }], purchase_items: [] }, 5);
    expect(s.order.approval_status).toBe("APPROVED");
    expect(order.production_request.items.map((i) => [i.product_id, i.quantity])).toEqual([[1, 2], [2, 5]]);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["0.00", "15.00"]);
  });
});

/* ---- duplicate requests never deduct twice ---------------------------------------------------------------------- */
describe("duplicate requests never deduct twice", () => {
  // Plenty of stock: 19 on hand - 3 reserved = 16 available = enough for 8 of the 10 ordered units.
  // The admin approves only 3 now. This is the case where a repeated request used to be accepted as "the next pass".
  const stock = () => s.inventory.map((row) => row.quantity_on_hand);
  const partial = (key = "click-0001", extra = {}) => ({
    idempotency_key: key,
    expected_round: 0,
    production_items: [{ product_id: 1, quantity: 3 }],
    purchase_items: [{ component_id: 1, quantity: 4 }],
    ...extra,
  });
  beforeEach(() => { s.inventory[0].quantity_on_hand = "19.00"; });

  it("API retry: the same request is replayed, never applied a second time", async () => {
    let replays = 0;
    const first = await rawService.dispatch(7, partial(), 5);
    const again = await rawService.dispatch(7, partial(), 5, { onReplay: () => replays++ });

    expect(again).toEqual(first); // the client gets the original answer back
    expect(replays).toBe(1);
    expect(stock()).toEqual(["13.00", "97.00"]); // 3 units' materials, once
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toEqual([[7, 1, 3, 5]]);
    expect(s.idem).toHaveLength(1);
  });

  it("double click: two identical requests in flight at once deduct once", async () => {
    const [a, b] = await Promise.all([rawService.dispatch(7, partial(), 5), rawService.dispatch(7, partial(), 5)]);
    expect(b).toEqual(a);
    expect(stock()).toEqual(["13.00", "97.00"]);
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toHaveLength(1);
  });

  it("double click on approve(): once", async () => {
    const body = { idempotency_key: "click-0002", expected_round: 0 };
    const results = await Promise.all([rawService.approve(7, body, 5), rawService.approve(7, body, 5), rawService.approve(7, body, 5)]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(s.productionRows).toEqual([[7, 1, 8, 5]]); // everything the stock allows, approved once
    expect(stock()).toEqual(["3.00", "92.00"]);
    expect(s.ledger).toHaveLength(2);
  });

  it("a retry after the response was lost gets the original success, not a misleading 'already decided'", async () => {
    s.inventory[0].quantity_on_hand = "100.00";
    const full = { idempotency_key: "click-0003", expected_round: 0, production_items: [{ product_id: 1, quantity: 10 }], purchase_items: [] };
    await rawService.dispatch(7, full, 5);
    expect(s.order.approval_status).toBe("APPROVED"); // decided: without the key this retry would be ALREADY_DECIDED
    await expect(rawService.dispatch(7, full, 5)).resolves.toMatchObject({ approval_status: "APPROVED" });
    expect(s.ledger).toHaveLength(2);
  });

  it("repeated approval with a NEW key (second admin, stale tab) is refused with STALE_ROUND", async () => {
    await rawService.dispatch(7, partial("click-0004"), 5);
    const other = rawService.dispatch(7, partial("click-0005"), 6); // same screen, same numbers, different key
    await expect(other).rejects.toMatchObject({ status: 409, code: "STALE_ROUND", extra: { current_round: 1 } });
    expect(stock()).toEqual(["13.00", "97.00"]);
    expect(s.productionRows).toHaveLength(1);
    expect(s.order.approval_round).toBe(1);
  });

  it("the same key for a DIFFERENT request is refused and deducts nothing", async () => {
    await rawService.dispatch(7, partial("click-0006"), 5);
    const changed = partial("click-0006", { production_items: [{ product_id: 1, quantity: 2 }] });
    await expect(rawService.dispatch(7, changed, 5)).rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_CONFLICT" });
    expect(stock()).toEqual(["13.00", "97.00"]);
  });

  it("a key cannot be replayed by another user", async () => {
    await rawService.dispatch(7, partial("click-0007"), 5);
    await expect(rawService.dispatch(7, partial("click-0007"), 99)).rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("a request that failed leaves no key behind, so it can be retried with the same key", async () => {
    s.inventory[0].quantity_on_hand = "11.00"; // stock changed after the admin looked: 4 units possible, 6 asked
    const wanted = { idempotency_key: "click-0008", expected_round: 0, production_items: [{ product_id: 1, quantity: 6 }], purchase_items: [{ component_id: 1, quantity: 8 }] };
    await expect(rawService.dispatch(7, wanted, 5)).rejects.toMatchObject({ code: "STALE_PLAN" });
    expect(s.idem).toHaveLength(0);

    s.inventory[0].quantity_on_hand = "15.00"; // back to what the screen showed
    await expect(rawService.dispatch(7, wanted, 5)).resolves.toMatchObject({ approval_status: "PARTIALLY_APPROVED" });
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
  });

  it("a stale round is refused before anything is deducted", async () => {
    s.order.approval_status = "PARTIALLY_APPROVED";
    s.order.approval_round = 2;
    await expect(rawService.dispatch(7, partial("click-0009", { expected_round: 1 }), 5)).rejects.toMatchObject({ code: "STALE_ROUND", extra: { current_round: 2 } });
    expect(s.ledger).toHaveLength(0);
  });

  it("if the database's UNIQUE ledger key ever fires, the request fails cleanly as ALREADY_APPLIED", async () => {
    s.ledgerError = Object.assign(new Error("Duplicate entry 'approval-7-1-1' for key 'uq_inv_txn_idempotency'"), { errno: 1062 });
    await expect(rawService.dispatch(7, partial("click-0010"), 5)).rejects.toMatchObject({ status: 409, code: "ALREADY_APPLIED" });
    expect(s.idem).toHaveLength(0); // rolled back with the rest
  });

  it("requires an idempotency key and the expected round on every stock-moving call", async () => {
    const { idempotency_key, ...noKey } = partial();
    const { expected_round, ...noRound } = partial("click-0011");
    await expect(rawService.dispatch(7, noKey, 5)).rejects.toMatchObject({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(rawService.dispatch(7, partial("bad key!"), 5)).rejects.toMatchObject({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(rawService.dispatch(7, noRound, 5)).rejects.toMatchObject({ status: 422, code: "EXPECTED_ROUND_REQUIRED" });
    await expect(rawService.approve(7, { idempotency_key: "click-0012" }, 5)).rejects.toMatchObject({ status: 422, code: "EXPECTED_ROUND_REQUIRED" });
    await expect(rawService.approve(7, { idempotency_key: "click-0013", expected_round: null }, 5)).rejects.toMatchObject({ code: "EXPECTED_ROUND_REQUIRED" });
    expect(s.ledger).toHaveLength(0);
  });

  it("reject moves no stock, so it needs no key", async () => {
    await expect(rawService.reject(7, { remarks: "not needed" }, 5)).resolves.toMatchObject({ approval_status: "REJECTED" });
  });

  it("the plan tells the screen which round its numbers belong to", async () => {
    expect((await rawService.getPlan(7)).approval_round).toBe(0);
    await rawService.dispatch(7, partial("click-0014"), 5);
    expect((await rawService.getPlan(7)).approval_round).toBe(1);
  });

  it("approving the rest (round 2) is also applied once", async () => {
    await rawService.dispatch(7, partial("click-0015"), 5); // round 1: 3 units
    const rest = { idempotency_key: "click-0016", expected_round: 1, production_items: [{ product_id: 1, quantity: 3 }], purchase_items: [] };
    await rawService.dispatch(7, rest, 5);
    await rawService.dispatch(7, rest, 5); // retry
    expect(s.order.approval_round).toBe(2);
    expect(s.productionRows).toEqual([[7, 1, 3, 5], [7, 1, 3, 5]]); // two passes of 3, not three
    expect(stock()).toEqual(["7.00", "94.00"]);
  });
});

/* One transaction: approval status + stock deduction + ledger rows + production/purchase lists are saved together or not at all. */
describe("all or nothing: approval status, stock and ledger", () => {
  const nothingChanged = () => {
    expect(s.order.approval_status).toBe("PENDING_APPROVAL");
    expect(s.order.approval_round).toBe(0);
    expect(s.order.inventory_issued_at).toBeUndefined();
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["15.00", "100.00"]);
    expect(s.ledger).toHaveLength(0);
    expect(s.productionRows).toHaveLength(0);
    expect(s.purchaseRows).toHaveLength(0);
    expect(s.idem).toHaveLength(0);
  };
  const deadlock = () => Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213 });

  it("a ledger write that fails half-way undoes the stock already deducted and the lists already saved", async () => {
    s.failLedgerOnNth = 2; // component 1 is deducted and logged, then component 2's ledger row fails
    await expect(service.approve(7, {}, 5)).rejects.toMatchObject({ message: "ledger write failed" });
    nothingChanged();
  });

  it("dispatch: the same half-way failure leaves nothing behind, purchase list included", async () => {
    s.failLedgerOnNth = 2;
    await expect(service.dispatch(7, rightLists(), 5)).rejects.toMatchObject({ message: "ledger write failed" });
    nothingChanged();
  });

  it("if the order's status row is not saved, the stock and ledger written before it are undone", async () => {
    s.orderUpdateRows = 0;
    await expect(service.approve(7, {}, 5)).rejects.toMatchObject({ status: 409, code: "ORDER_NOT_SAVED" });
    nothingChanged();
    s.orderUpdateRows = 0;
    await expect(service.dispatch(7, rightLists(), 5)).rejects.toMatchObject({ code: "ORDER_NOT_SAVED" });
    nothingChanged();
  });

  it("approve(): a deadlock retry still deducts the stock and writes the ledger exactly once", async () => {
    s.orderUpdateErrors = [deadlock()]; // the first attempt dies on its LAST statement, after it already worked out the status
    await service.approve(7, {}, 5);
    expect(s.order.approval_status).toBe("PARTIALLY_APPROVED");
    expect(s.order.approval_round).toBe(1);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["3.00", "94.00"]); // not 15 / 100: the retry did the work
    expect(s.ledger).toHaveLength(2); // not 0 and not 4
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(s.idem).toHaveLength(1);
  });

  it("dispatch(): a deadlock retry also applies everything once", async () => {
    s.orderUpdateErrors = [deadlock()];
    await service.dispatch(7, rightLists(), 5);
    expect(s.order.approval_round).toBe(1);
    expect(s.inventory.map((row) => row.quantity_on_hand)).toEqual(["3.00", "94.00"]);
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(s.purchaseRows).toEqual([[7, 1, 8, 5]]);
  });

  it("when every retry fails, the request fails and nothing is saved", async () => {
    s.orderUpdateErrors = [deadlock(), deadlock(), deadlock()];
    await expect(service.approve(7, {}, 5)).rejects.toMatchObject({ errno: 1213 });
    nothingChanged();
  });
});

describe("Store Manager notification: which components to issue", () => {
  it("dispatch saves ONE notification listing every component and its quantity", async () => {
    await service.dispatch(7, rightLists(), 5);
    expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0]).toMatchObject({ role: "STORE_MANAGER", type: "ISSUE_COMPONENTS", order_id: 7, title: "Issue components for order ORD-007" });
    expect(s.notifications[0].payload.items).toEqual([
      { component_id: 1, sku: "CMP-001", name: "Resistor", unit: "pcs", quantity: "12.00" },
      { component_id: 2, sku: "CMP-002", name: "Capacitor", unit: "pcs", quantity: "6.00" },
    ]);
  });

  it("approve() notifies too, and the live push goes out once, after the commit", async () => {
    await service.approve(7, {}, 5);
    expect(s.notifications).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ role: "STORE_MANAGER", type: "ISSUE_COMPONENTS", notificationId: 1 });
  });

  it("a rolled-back approval leaves no notification and sends no push", async () => {
    s.orderUpdateErrors = [new Error("disk full")];
    await expect(service.dispatch(7, rightLists(), 5)).rejects.toThrow("disk full");
    expect(s.notifications).toEqual([]);
    expect(pushes).toEqual([]);
  });

  it("a deadlock retry still produces exactly one notification and one push", async () => {
    s.orderUpdateErrors = [Object.assign(new Error("Deadlock found"), { errno: 1213, code: "ER_LOCK_DEADLOCK" })];
    await service.dispatch(7, rightLists(), 5);
    expect(s.notifications).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });
});

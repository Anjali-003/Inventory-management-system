/**
 * Operations Admin, after an order is sent (modules/order-approvals/order-approval.service.js):
 *   approve()          the decision only: Marketing is told, no stock moves, no list is sent
 *   sendToPurchase()   the components that are short go to Purchase, once per order
 *   sendToProduction() what the stock can build now goes to Production and its stock is deducted; again when parts come in
 *   npm test
 * MySQL is replaced by a tiny in-memory fake that understands only the queries this service sends, so this proves
 * the logic (plan, stale-plan check, what gets saved, all-or-nothing, no double deduction), not one real MySQL run.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

/* ---- fake database ------------------------------------------------------------------------------------------ */
let s;
const fresh = () => ({
  order: { id: 7, order_number: "ORD-007", status: "PENDING", approval_status: "PENDING_APPROVAL", approval_remarks: null, approval_round: 0 },
  // 10 Smart Controllers: 2 resistors + 1 capacitor each
  items: [{ product_id: 1, sku: "PRD-001", name: "Smart Controller", quantity: "10.00", selling_price: null }],
  bom: [
    { product_id: 1, component_id: 1, quantity_required: "2.00", sku: "CMP-001", name: "Resistor", unit: "pcs" },
    { product_id: 1, component_id: 2, quantity_required: "1.00", sku: "CMP-002", name: "Capacitor", unit: "pcs" },
  ],
  // 12 resistors -> 6 units can be built now; the other 4 units need 8 more resistors
  inventory: [
    { component_id: 1, quantity_on_hand: "12.00" },
    { component_id: 2, quantity_on_hand: "100.00" },
  ],
  ledger: [],
  notifications: [],
  productionRows: [],
  purchaseRows: [],
  events: [],
  idem: [], // idempotency_keys table
  ledgerError: null, // set a test to make the next ledger INSERT fail (e.g. the UNIQUE key firing)
  failLedgerOnNth: 0, // n: the n-th ledger row fails (after the earlier rows were already written)
  orderUpdateErrors: [], // errors thrown by the next UPDATE orders calls, one per call (e.g. a deadlock)
  orderUpdateRows: 1, // affectedRows answered by UPDATE orders (0 = the row did not land)
  locks: 0,
});

const has = (sql, text) => sql.replace(/\s+/g, " ").includes(text);
function updateOrder(sql, params) {
  if (s.orderUpdateErrors.length) throw s.orderUpdateErrors.shift();
  if (s.orderUpdateRows !== 1) return [{ affectedRows: s.orderUpdateRows }];
  if (has(sql, "SET approval_status = ?, approval_remarks = ?, approved_by = ?, approved_at = NOW()")) {
    s.order = { ...s.order, approval_status: params[0], approval_remarks: params[1] };
  } else if (has(sql, "SET approval_round = ?, inventory_issued_at")) {
    s.order = { ...s.order, approval_round: params[0], inventory_issued_at: true };
  } else {
    throw new Error("fake db: unexpected UPDATE orders: " + sql.replace(/\s+/g, " ").slice(0, 120));
  }
  return [{ affectedRows: 1 }];
}
function run(sql, params = []) {
  if (has(sql, "SELECT id, approval_status, approval_round FROM orders WHERE id = ? FOR UPDATE")) { s.locks++; return [s.order.id === params[0] ? [{ ...s.order }] : []]; }
  if (has(sql, "SELECT approval_status, approval_round FROM orders WHERE id = ?")) return [s.order.id === params[0] ? [{ approval_status: s.order.approval_status, approval_round: s.order.approval_round }] : []];
  // units already sent to Production (summed per product), so a later send only plans what is still open
  if (has(sql, "SUM(quantity) AS quantity FROM order_production_items WHERE order_id = ? GROUP BY product_id")) {
    const sums = new Map();
    for (const [order_id, product_id, quantity] of s.productionRows) if (order_id === params[0]) sums.set(product_id, (sums.get(product_id) || 0) + Number(quantity));
    return [[...sums].map(([product_id, quantity]) => ({ product_id, quantity }))];
  }
  if (has(sql, "SELECT COUNT(*) AS n FROM order_production_items WHERE order_id = ?")) return [[{ n: s.productionRows.length }]];
  if (has(sql, "SELECT COUNT(*) AS n FROM order_purchase_items WHERE order_id = ?")) return [[{ n: s.purchaseRows.length }]];
  if (has(sql, "FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?")) return [s.items];
  if (has(sql, "FROM order_items oi") && has(sql, "oi.order_id IN")) return [s.items.map((i) => ({ ...i, order_id: s.order.id }))];
  if (has(sql, "SELECT COALESCE(SUM(quantity), 0) AS n FROM order_items WHERE order_id = ?")) return [[{ n: s.items.reduce((t, i) => t + Number(i.quantity), 0) }]];
  if (has(sql, "FROM product_bom pb")) return [s.bom];
  if (has(sql, "FROM inventory WHERE component_id IN")) { if (has(sql, "FOR UPDATE")) s.locks++; return [s.inventory]; }
  if (has(sql, "UPDATE inventory SET quantity_on_hand = quantity_on_hand -")) {
    const row = s.inventory.find((item) => item.component_id === params[1]);
    if (!row || Number(row.quantity_on_hand) < Number(params[2])) return [{ affectedRows: 0 }];
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
    s.ledger.push({ component_id: params[0], quantity: params[1], key: params[7] });
    return [{ insertId: s.ledger.length }];
  }
  if (has(sql, "SELECT order_number FROM orders WHERE id = ?")) return [[{ order_number: s.order.order_number }]];
  // notifyDecision(): who raised the order decides whether Marketing hears the outcome
  if (has(sql, "u.role AS creator_role FROM orders o LEFT JOIN users u")) return [[{ order_number: s.order.order_number, creator_role: s.order.creator_role ?? "MARKETING_MANAGER" }]];
  if (has(sql, "INSERT INTO notifications")) {
    const [role, type, title, body, severity, link, requires_action, order_id] = params;
    s.notifications.push({ role, type, title, body, severity, link, requires_action, order_id });
    return [{ insertId: s.notifications.length }];
  }
  if (has(sql, "UPDATE orders")) return updateOrder(sql, params);
  if (has(sql, "INSERT INTO order_production_items")) { s.productionRows.push(...params[0]); return [{}]; }
  if (has(sql, "INSERT INTO order_purchase_items")) { s.purchaseRows.push(...params[0]); return [{}]; }
  if (has(sql, "FROM order_production_items r")) {
    return [s.productionRows.map(([order_id, product_id, quantity]) => ({ order_id, product_id, sku: "PRD-001", name: "Smart Controller", quantity, sent_by_name: "Ops", sent_at: "2026-10-14 11:00:00" }))];
  }
  if (has(sql, "FROM order_purchase_items r")) {
    return [s.purchaseRows.map(([order_id, component_id, quantity]) => ({ order_id, component_id, sku: `CMP-00${component_id}`, name: "Resistor", unit: "pcs", quantity, sent_by_name: "Ops", sent_at: "2026-10-14 11:00:00" }))];
  }
  if (has(sql, "INSERT INTO order_events")) { s.events.push({ order_id: params[0], kind: params[1], actor_id: params[2], quantity: params[3], detail: params[4] }); return [{ insertId: s.events.length }]; }
  if (has(sql, "FROM order_events e")) return [s.events.map((e) => ({ ...e, at: "2026-10-14 11:00:00", by_name: "Ops", by_role: "OPERATIONS_ADMIN" }))];
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
const TABLES = ["order", "inventory", "ledger", "notifications", "productionRows", "purchaseRows", "events"];
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
        snapshot = structuredClone(Object.fromEntries(TABLES.map((t) => [t, s[t]])));
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
const service = require("../src/modules/order-approvals/order-approval.service.js");
// live pushes: record them instead of writing to real browser connections
const hub = require("../src/realtime/hub.js");
let pushes = [];
hub.notifyRole = (role, data) => pushes.push({ role, ...data });

let keyCounter = 0;
const key = () => `test-key-${++keyCounter}`;
const approve = (extra = {}) => service.approve(7, { idempotency_key: key(), expected_round: s.order.approval_round, ...extra }, 5);
const toProduction = (quantity, extra = {}) =>
  service.sendToProduction(7, { idempotency_key: key(), expected_round: s.order.approval_round, production_items: [{ product_id: 1, quantity }], ...extra }, 5);
const toPurchase = (items = [{ component_id: 1, quantity: 8 }]) => service.sendToPurchase(7, { purchase_items: items }, 5);
const stock = () => s.inventory.map((row) => row.quantity_on_hand);

beforeEach(() => { s = fresh(); pushes = []; });

describe("stock check (getPlan)", () => {
  it("shows what can be built now and which component is short", async () => {
    const plan = await service.getPlan(7);
    expect(plan.lines).toMatchObject([{ product_id: 1, ordered: 10, can_make: 6, remaining: 4 }]);
    expect(plan.shortages).toMatchObject([{ component_id: 1, shortage: 8 }]);
    expect(plan.purchase_sent).toBe(false);
    expect(plan.approval_round).toBe(0);
  });

  it("reports a product with an unfinished BOM instead of guessing", async () => {
    s.bom[0].quantity_required = null;
    const plan = await service.getPlan(7);
    expect(plan.missing_bom).toEqual([1]);
    expect(plan.lines[0].can_make).toBe(0);
  });

  it("is refused for an order that is closed", async () => {
    s.order.approval_status = "REJECTED";
    await expect(service.getPlan(7)).rejects.toMatchObject({ status: 409, code: "ALREADY_DECIDED" });
  });

  it("on an approved order, only plans the units not in Production yet", async () => {
    await approve();
    await toProduction(6);
    const plan = await service.getPlan(7);
    expect(plan.lines).toMatchObject([{ ordered: 4, can_make: 0 }]);
    expect(plan.approval_round).toBe(1);
  });
});

describe("approve: the decision only", () => {
  it("approves, tells Marketing, and moves no stock and sends no list", async () => {
    const order = await approve({ remarks: "go ahead" });
    expect(order.approval_status).toBe("APPROVED");
    expect(order.left_to_send).toBe(10);
    expect(stock()).toEqual(["12.00", "100.00"]);
    expect(s.ledger).toHaveLength(0);
    expect(s.productionRows).toHaveLength(0);
    expect(s.purchaseRows).toHaveLength(0);
    expect(s.notifications).toMatchObject([{ role: "MARKETING_MANAGER", type: "ORDER_APPROVED", body: "go ahead" }]);
    expect(s.events).toMatchObject([{ kind: "APPROVED", quantity: 10 }]);
  });

  it("an order not raised by Marketing does not notify Marketing", async () => {
    s.order.creator_role = "OPERATIONS_ADMIN";
    await approve();
    expect(s.notifications).toHaveLength(0);
  });

  it("reject needs a reason, tells Marketing only, and needs no key", async () => {
    await expect(service.reject(7, { remarks: "" }, 5)).rejects.toMatchObject({ status: 422 });
    await expect(service.reject(7, { remarks: "Too many units" }, 5)).resolves.toMatchObject({ approval_status: "REJECTED" });
    expect(s.notifications).toMatchObject([{ role: "MARKETING_MANAGER", type: "ORDER_REJECTED", body: "Too many units" }]);
    expect(s.events).toMatchObject([{ kind: "REJECTED" }]);
  });

  it("an order cannot be approved twice, and an approved one cannot be rejected", async () => {
    await approve();
    await expect(approve()).rejects.toMatchObject({ status: 409, code: "ALREADY_DECIDED" });
    await expect(service.reject(7, { remarks: "late change" }, 5)).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });
});

describe("send the list to Purchase", () => {
  it("needs an approved order", async () => {
    await expect(toPurchase()).rejects.toMatchObject({ status: 409, code: "NOT_APPROVED" });
  });

  it("saves the components that are short and tells Purchase, moving no stock", async () => {
    await approve();
    const order = await toPurchase();
    expect(s.purchaseRows).toEqual([[7, 1, 8, 5]]);
    expect(order.purchase_request.items).toMatchObject([{ component_id: 1, quantity: 8 }]);
    expect(s.ledger).toHaveLength(0);
    expect(s.notifications.at(-1)).toMatchObject({ role: "PURCHASE_MANAGER", type: "PURCHASE_REQUIRED" });
    expect(s.events.at(-1)).toMatchObject({ kind: "SENT_TO_PURCHASE", quantity: 10 });
    expect((await service.getPlan(7)).purchase_sent).toBe(true);
  });

  it("is sent once per order", async () => {
    await approve();
    await toPurchase();
    await expect(toPurchase()).rejects.toMatchObject({ status: 409, code: "ALREADY_SENT" });
    expect(s.purchaseRows).toHaveLength(1);
  });

  it("refuses a list that no longer matches the stock (STALE_PLAN) and saves nothing", async () => {
    await approve();
    await expect(toPurchase([{ component_id: 1, quantity: 5 }])).rejects.toMatchObject({ status: 409, code: "STALE_PLAN" });
    expect(s.purchaseRows).toHaveLength(0);
  });

  it("says so when nothing is short", async () => {
    s.inventory[0].quantity_on_hand = "50.00";
    await approve();
    await expect(toPurchase([])).rejects.toMatchObject({ status: 422, code: "NOTHING_TO_BUY" });
  });
});

describe("send to Production", () => {
  it("needs an approved order", async () => {
    await expect(toProduction(6)).rejects.toMatchObject({ status: 409, code: "NOT_APPROVED" });
    expect(s.ledger).toHaveLength(0);
  });

  it("sends what the stock can build now and deducts exactly its BOM", async () => {
    await approve();
    const order = await toProduction(6);
    expect(stock()).toEqual(["0.00", "94.00"]); // 6 units x (2 resistors, 1 capacitor)
    expect(s.ledger.map((l) => [l.component_id, l.quantity, l.key])).toEqual([[1, "12.00", "approval-7-1-1"], [2, "6.00", "approval-7-1-2"]]);
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(order.left_to_send).toBe(4);
    expect(s.order).toMatchObject({ approval_round: 1, inventory_issued_at: true });
    expect(s.notifications.at(-1)).toMatchObject({ role: "PRODUCTION_MANAGER", type: "PRODUCTION_ASSIGNED", title: "Order ORD-007 is ready for production" });
    expect(s.events.at(-1)).toMatchObject({ kind: "SENT_TO_PRODUCTION", quantity: 6 });
  });

  it("locks the stock rows while it re-checks the plan", async () => {
    await approve();
    s.locks = 0;
    await toProduction(6);
    expect(s.locks).toBeGreaterThanOrEqual(2); // the order row and the inventory rows
  });

  it("is refused while nothing can be built, and moves nothing", async () => {
    s.inventory[0].quantity_on_hand = "0.00";
    await approve();
    await expect(service.sendToProduction(7, { idempotency_key: key(), expected_round: 0, production_items: [] }, 5)).rejects.toMatchObject({ status: 422, code: "NOTHING_TO_BUILD" });
    await expect(toProduction(1)).rejects.toMatchObject({ code: "NOTHING_TO_BUILD" });
    expect(s.ledger).toHaveLength(0);
  });

  it("refuses with STALE_PLAN when the stock changed after the admin looked, and saves nothing", async () => {
    await approve();
    s.inventory[0].quantity_on_hand = "8.00"; // only 4 units now, the screen said 6
    await expect(toProduction(6)).rejects.toMatchObject({ status: 409, code: "STALE_PLAN" });
    expect(stock()).toEqual(["8.00", "100.00"]);
    expect(s.productionRows).toHaveLength(0);
    expect(s.ledger).toHaveLength(0);
  });

  it("refuses a quantity the admin edited by hand", async () => {
    await approve();
    await expect(toProduction(3)).rejects.toMatchObject({ code: "STALE_PLAN" });
  });

  it("sends again when the parts come in: only the open units, with their own ledger keys", async () => {
    await approve();
    await toProduction(6);
    s.inventory[0].quantity_on_hand = "8.00"; // the purchased resistors are in: enough for the last 4 units
    const order = await toProduction(4);
    expect(order.left_to_send).toBe(0);
    expect(s.productionRows).toEqual([[7, 1, 6, 5], [7, 1, 4, 5]]);
    expect(s.ledger.map((l) => l.key)).toEqual(["approval-7-1-1", "approval-7-1-2", "approval-7-2-1", "approval-7-2-2"]);
    expect(s.notifications.at(-1).title).toBe("More of order ORD-007 can be built");
    await expect(service.getPlan(7)).rejects.toMatchObject({ code: "NOTHING_LEFT" });
  });
});

describe("duplicate requests never deduct twice", () => {
  const body = (k, extra = {}) => ({ idempotency_key: k, expected_round: 0, production_items: [{ product_id: 1, quantity: 6 }], ...extra });
  // the keys of the sends only (approve() in beforeEach keeps its own)
  const sendKeys = () => s.idem.filter((k) => k.action === "order.send-to-production");
  beforeEach(async () => { await approve(); });

  it("API retry: the same request is replayed, never applied a second time", async () => {
    let replays = 0;
    const first = await service.sendToProduction(7, body("click-0001"), 5);
    const again = await service.sendToProduction(7, body("click-0001"), 5, { onReplay: () => replays++ });
    expect(again).toEqual(first);
    expect(replays).toBe(1);
    expect(stock()).toEqual(["0.00", "94.00"]);
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toHaveLength(1);
  });

  it("double click: two identical requests in flight at once deduct once", async () => {
    const [a, b] = await Promise.all([service.sendToProduction(7, body("click-0002"), 5), service.sendToProduction(7, body("click-0002"), 5)]);
    expect(b).toEqual(a);
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toHaveLength(1);
  });

  it("the same send with a NEW key (second admin, stale tab) is refused with STALE_ROUND", async () => {
    await service.sendToProduction(7, body("click-0003"), 5);
    await expect(service.sendToProduction(7, body("click-0004"), 6)).rejects.toMatchObject({ status: 409, code: "STALE_ROUND", extra: { current_round: 1 } });
    expect(s.ledger).toHaveLength(2);
  });

  it("the same key for a DIFFERENT request, or from another user, is refused and deducts nothing", async () => {
    await service.sendToProduction(7, body("click-0005"), 5);
    await expect(service.sendToProduction(7, body("click-0005", { production_items: [{ product_id: 1, quantity: 2 }] }), 5)).rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.sendToProduction(7, body("click-0005"), 99)).rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_CONFLICT" });
    expect(s.ledger).toHaveLength(2);
  });

  it("a request that failed leaves no key behind, so it can be retried with the same key", async () => {
    s.inventory[0].quantity_on_hand = "8.00";
    await expect(service.sendToProduction(7, body("click-0006"), 5)).rejects.toMatchObject({ code: "STALE_PLAN" });
    expect(sendKeys()).toHaveLength(0);
    s.inventory[0].quantity_on_hand = "12.00";
    await expect(service.sendToProduction(7, body("click-0006"), 5)).resolves.toMatchObject({ left_to_send: 4 });
  });

  it("if the database's UNIQUE ledger key ever fires, the request fails cleanly as ALREADY_APPLIED", async () => {
    s.ledgerError = Object.assign(new Error("Duplicate entry 'approval-7-1-1' for key 'uq_inv_txn_idempotency'"), { errno: 1062 });
    await expect(service.sendToProduction(7, body("click-0007"), 5)).rejects.toMatchObject({ status: 409, code: "ALREADY_APPLIED" });
    expect(sendKeys()).toHaveLength(0);
    expect(s.productionRows).toHaveLength(0);
  });

  it("requires an idempotency key and the expected round", async () => {
    const { idempotency_key, ...noKey } = body("x");
    const { expected_round, ...noRound } = body("click-0008");
    await expect(service.sendToProduction(7, noKey, 5)).rejects.toMatchObject({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(service.sendToProduction(7, body("bad key!"), 5)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(service.sendToProduction(7, noRound, 5)).rejects.toMatchObject({ status: 422, code: "EXPECTED_ROUND_REQUIRED" });
    expect(s.ledger).toHaveLength(0);
  });
});

/* One transaction: stock deduction + ledger rows + the production list + the round are saved together or not at all. */
describe("all or nothing", () => {
  const deadlock = () => Object.assign(new Error("Deadlock found when trying to get lock"), { errno: 1213 });
  const nothingSent = () => {
    expect(s.order.approval_round).toBe(0);
    expect(s.order.inventory_issued_at).toBeUndefined();
    expect(stock()).toEqual(["12.00", "100.00"]);
    expect(s.ledger).toHaveLength(0);
    expect(s.productionRows).toHaveLength(0);
    expect(s.events.filter((e) => e.kind === "SENT_TO_PRODUCTION")).toHaveLength(0);
    expect(s.idem.filter((k) => k.action === "order.send-to-production")).toHaveLength(0);
  };
  beforeEach(async () => { await approve(); });

  it("a ledger write that fails half-way undoes the stock already deducted and the list already saved", async () => {
    s.failLedgerOnNth = 2; // component 1 is deducted and logged, then component 2's ledger row fails
    await expect(toProduction(6)).rejects.toMatchObject({ message: "ledger write failed" });
    nothingSent();
  });

  it("if the order row is not saved, everything written before it is undone", async () => {
    s.orderUpdateRows = 0;
    await expect(toProduction(6)).rejects.toMatchObject({ status: 409, code: "ORDER_NOT_SAVED" });
    nothingSent();
  });

  it("a deadlock retry still deducts the stock and writes the ledger exactly once", async () => {
    s.orderUpdateErrors = [deadlock()];
    await toProduction(6);
    expect(s.order.approval_round).toBe(1);
    expect(stock()).toEqual(["0.00", "94.00"]);
    expect(s.ledger).toHaveLength(2);
    expect(s.productionRows).toEqual([[7, 1, 6, 5]]);
    expect(s.notifications.filter((n) => n.role === "PRODUCTION_MANAGER")).toHaveLength(1);
  });

  it("when every retry fails, the request fails and nothing is saved", async () => {
    s.orderUpdateErrors = [deadlock(), deadlock(), deadlock()];
    await expect(toProduction(6)).rejects.toMatchObject({ errno: 1213 });
    nothingSent();
  });
});

describe("the live push goes out once, after the commit", () => {
  it("a send to Production pushes to Production once", async () => {
    await approve();
    pushes = [];
    await toProduction(6);
    expect(pushes.filter((p) => p.role === "PRODUCTION_MANAGER")).toHaveLength(1);
  });

  it("a rolled-back send pushes nothing", async () => {
    await approve();
    pushes = [];
    s.failLedgerOnNth = 1;
    await expect(toProduction(6)).rejects.toThrow();
    expect(pushes).toHaveLength(0);
  });
});

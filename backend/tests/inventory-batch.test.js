// Run: node tests/inventory-batch.test.js   (from /backend)
// Logic test of POST /inventory/stock-in/batch against an in-memory stand-in for MySQL.
// It proves validation, atomic rollback, idempotency and lock order; it does NOT replace one real run against MySQL.
const assert = require("assert");
const path = require("path");
const B = path.join(__dirname, "../src");

// ---------- tiny in-memory stand-in for the tables the batch touches ----------
const clone = (o) => JSON.parse(JSON.stringify(o));
let st;
const reset = () => {
  st = {
    components: [{ id: 1, sku: "CMP-001", name: "LED Display PCB", unit: "pcs" }, { id: 2, sku: "CMP-002", name: "Red LED", unit: "pcs" }],
    inventory: [{ id: 1, component_id: 1, quantity_on_hand: "10.00", quantity_reserved: "0.00", is_active: 1 }, { id: 2, component_id: 2, quantity_on_hand: "5.00", quantity_reserved: "0.00", is_active: 0 }],
    ledger: [], nextC: 3, nextI: 3, nextL: 1, calls: [],
  };
};
const dup = (msg) => Object.assign(new Error(msg), { errno: 1062 });
function run(sql, p = []) {
  const q = sql.replace(/\s+/g, " ").trim();
  st.calls.push(q.slice(0, 40));
  let m;
  if (q.startsWith("SELECT t.id, t.idempotency_key")) {
    const rows = st.ledger.filter((l) => p[0].includes(l.idempotency_key)).map((l) => {
      const c = st.components.find((c) => c.id === l.component_id);
      return { id: l.id, idempotency_key: l.idempotency_key, component_id: l.component_id, quantity: l.quantity, balance_after: l.balance_after, sku: c.sku, name: c.name, unit: c.unit };
    });
    return [rows];
  }
  if (q.startsWith("SELECT sku FROM components WHERE name")) return [st.components.filter((c) => c.name.toLowerCase() === p[0].toLowerCase()).map((c) => ({ sku: c.sku }))];
  if (q.startsWith("INSERT INTO components")) {
    if (st.components.some((c) => c.sku === p[0])) throw dup("Duplicate entry for key 'components.sku'");
    const row = { id: st.nextC++, sku: p[0], name: p[1], description: p[2], unit: p[3], min: p[4], category: p[5], size: p[6] };
    st.components.push(row); return [{ insertId: row.id }];
  }
  if (q.startsWith("SELECT id FROM components WHERE id IN")) return [st.components.filter((c) => p[0].includes(c.id)).map((c) => ({ id: c.id }))];
  if (q.startsWith("INSERT INTO inventory (component_id")) {
    if (!st.inventory.some((i) => i.component_id === p[0])) st.inventory.push({ id: st.nextI++, component_id: p[0], quantity_on_hand: "0.00", quantity_reserved: "0.00", is_active: 1 });
    return [{}];
  }
  if (q.startsWith("SELECT * FROM inventory WHERE component_id IN")) { st.lockOrder = p[0].slice(); return [st.inventory.filter((i) => p[0].includes(i.component_id)).sort((a, b) => a.component_id - b.component_id)]; }
  if ((m = q.match(/^UPDATE inventory SET quantity_on_hand = \?, is_active = 1/))) {
    const r = st.inventory.find((i) => i.id === p[1]); r.quantity_on_hand = p[0]; r.is_active = 1; return [{ affectedRows: 1 }];
  }
  if (q.startsWith("UPDATE inventory SET location = ?")) { st.inventory.find((i) => i.id === p[1]).location = p[0]; return [{ affectedRows: 1 }]; }
  if (q.startsWith("UPDATE components SET category = COALESCE")) {
    const c = st.components.find((c) => c.id === p[2]); c.category = p[0] ?? c.category; c.size = p[1] ?? c.size; return [{ affectedRows: 1 }];
  }
  if (q.startsWith("INSERT INTO inventory_transactions")) {
    const [component_id, type, direction, quantity, balance_after, reason, reference_no, created_by, key] = p;
    if (st.ledger.some((l) => l.idempotency_key === key)) throw dup("Duplicate entry for key 'inventory_transactions.uq_inv_txn_idempotency'");
    const row = { id: st.nextL++, component_id, type, direction, quantity, balance_after, reason, reference_no, created_by, idempotency_key: key };
    st.ledger.push(row); return [{ insertId: row.id }];
  }
  if (q.startsWith("SELECT id, sku, name, unit FROM components WHERE id IN")) return [st.components.filter((c) => p[0].includes(c.id))];
  throw new Error("fake db: unhandled SQL: " + q);
}
// Transactions are serialised like row locks would: a 2nd writer waits until the 1st commits/rolls back.
let gate = Promise.resolve();
const fakeDb = {
  query: async (s, p) => run(s, p),
  getConnection: async () => { let snap, release; return {
    beginTransaction: async () => { const prev = gate; gate = new Promise((r) => (release = r)); await prev; snap = clone(st); },
    commit: async () => { release && release(); },
    rollback: async () => { const calls = st.calls; Object.assign(st, snap); st.calls = calls; release && release(); },
    release: () => {},
    query: async (s, p) => run(s, p),
  }; },
};
require.cache[require.resolve(B + "/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const svc = require(B + "/services/inventoryService.js");

const K = () => "key-" + Math.random().toString(36).slice(2, 14);
const base = { reason: "Purchase receipt", reference_no: "PO-1" };
const rejects = async (fn, status, code, extra = {}) => {
  try { await fn(); } catch (e) {
    assert.strictEqual(e.status, status, `status ${e.status} ${e.message}`);
    if (code) assert.strictEqual(e.code, code, e.message);
    for (const [k, v] of Object.entries(extra)) assert.strictEqual(e.extra[k], v, `${k}: ${JSON.stringify(e.extra)}`);
    return e;
  }
  throw new Error("expected rejection");
};

(async () => {
  let n = 0; const t = async (name, fn) => { reset(); await fn(); n++; console.log("ok -", name); };

  await t("mixed receipt: existing + archived + new component posts everything", async () => {
    const r = await svc.stockInBatch({ idempotency_key: K(), items: [
      { component_id: 1, quantity: "2.5", ...base },
      { component_id: 2, quantity: 10, ...base },
      { new_component: { sku: "cmp-019", name: "  Blue   LED ", unit: "PCS", minimum_stock_level: "20" }, quantity: "100", ...base },
    ] }, 7);
    assert.strictEqual(r.count, 3); assert.strictEqual(r.replayed, false);
    assert.strictEqual(r.items[0].balance_after, "12.50");
    assert.strictEqual(r.items[1].balance_after, "15.00");
    assert.strictEqual(st.inventory.find((i) => i.component_id === 2).is_active, 1, "archived item reactivated");
    const nc = st.components.find((c) => c.sku === "CMP-019");
    assert.ok(nc && nc.name === "Blue LED" && nc.unit === "pcs", JSON.stringify(nc));
    assert.strictEqual(r.items[2].created, true); assert.strictEqual(r.items[2].sku, "CMP-019");
    assert.strictEqual(st.ledger.length, 3);
    for (const l of st.ledger) { assert.strictEqual(l.direction, "IN"); assert.strictEqual(l.type, "STOCK_IN"); assert.strictEqual(l.created_by, 7); assert.ok(l.reason && l.idempotency_key); }
    // ledger and inventory agree for every component
    for (const i of st.inventory) {
      const net = st.ledger.filter((l) => l.component_id === i.component_id).reduce((a, l) => a + Number(l.quantity), 0);
      const opening = { 1: 10, 2: 5 }[i.component_id] || 0;
      assert.strictEqual(Number(i.quantity_on_hand), opening + net);
    }
    assert.deepStrictEqual(st.lockOrder, [...st.lockOrder].sort((a, b) => a - b), "rows locked in id order");
  });

  await t("idempotency: same key twice posts ONCE and replays", async () => {
    const body = { idempotency_key: K(), items: [{ component_id: 1, quantity: "3", ...base }, { new_component: { sku: "NEW-1", name: "Thing", unit: "kg" }, quantity: "4", ...base }] };
    const a = await svc.stockInBatch(body, 1);
    const b = await svc.stockInBatch(JSON.parse(JSON.stringify(body)), 1);
    assert.strictEqual(b.replayed, true); assert.strictEqual(st.ledger.length, 2);
    assert.strictEqual(st.components.filter((c) => c.sku === "NEW-1").length, 1);
    assert.strictEqual(Number(st.inventory.find((i) => i.component_id === 1).quantity_on_hand), 13);
    assert.deepStrictEqual(b.items.map((x) => x.movement_id), a.items.map((x) => x.movement_id));
  });

  await t("idempotency: same key with different payload is a 409", async () => {
    const key = K();
    await svc.stockInBatch({ idempotency_key: key, items: [{ component_id: 1, quantity: "3", ...base }] }, 1);
    await rejects(() => svc.stockInBatch({ idempotency_key: key, items: [{ component_id: 1, quantity: "9", ...base }] }, 1), 409, "IDEMPOTENCY_CONFLICT");
    assert.strictEqual(st.ledger.length, 1);
  });

  await t("parallel double-submit (race) still posts once", async () => {
    const body = { idempotency_key: K(), items: [{ component_id: 1, quantity: "3", ...base }] };
    const [x, y] = await Promise.all([svc.stockInBatch(body, 1), svc.stockInBatch(body, 1)]);
    assert.strictEqual(st.ledger.length, 1);
    assert.strictEqual(Number(st.inventory[0].quantity_on_hand), 13);
    assert.ok(x && y);
  });

  await t("duplicate SKU for a new component rolls EVERYTHING back (nothing half-saved)", async () => {
    const before = clone(st);
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [
      { component_id: 1, quantity: "5", ...base },
      { new_component: { sku: "CMP-002", name: "Totally New", unit: "pcs" }, quantity: "1", ...base },
    ] }, 1), 409, "DUPLICATE_SKU", { line: 1, field: "sku" });
    assert.strictEqual(st.ledger.length, 0);
    assert.deepStrictEqual(st.inventory, before.inventory); assert.deepStrictEqual(st.components, before.components);
  });

  await t("duplicate name (any case) is refused with the line", async () => {
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ new_component: { sku: "ZZ-1", name: "red led", unit: "pcs" }, quantity: "1", ...base }] }, 1), 409, "DUPLICATE_NAME", { line: 0, field: "name" });
    assert.strictEqual(st.components.length, 2);
  });

  await t("unknown component -> 404 for that line, nothing posted", async () => {
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ component_id: 1, quantity: "1", ...base }, { component_id: 999, quantity: "1", ...base }] }, 1), 404, "NOT_FOUND", { line: 1 });
    assert.strictEqual(st.ledger.length, 0);
  });

  await t("validation: empty list, too many, bad qty, zero, 3 decimals, huge, missing reason/key", async () => {
    const ok = { component_id: 1, quantity: "1", ...base };
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [] }, 1), 422);
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: Array.from({ length: 51 }, (_, i) => ({ ...ok, component_id: i + 1 })) }, 1), 422);
    for (const q of ["0", "-3", "1.234", "abc", "", null, "99999999999"]) {
      await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ ...ok, quantity: q }] }, 1), 422, "VALIDATION", { line: 0, field: "quantity" });
    }
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ ...ok, reason: "" }] }, 1), 422, "VALIDATION", { line: 0 });
    await rejects(() => svc.stockInBatch({ items: [ok] }, 1), 400, "IDEMPOTENCY_KEY_REQUIRED");
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ quantity: "1", ...base }] }, 1), 422);
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ ...ok, new_component: { sku: "AB", name: "x y", unit: "pcs" } }] }, 1), 422);
    assert.strictEqual(st.ledger.length, 0);
  });

  await t("validation: bad / duplicate new-component fields", async () => {
    const mk = (nc, extra = {}) => ({ idempotency_key: K(), items: [{ new_component: nc, quantity: "1", ...base, ...extra }] });
    await rejects(() => svc.stockInBatch(mk({ sku: "a b", name: "Valid", unit: "pcs" }), 1), 422, "VALIDATION", { field: "sku" });
    await rejects(() => svc.stockInBatch(mk({ sku: "OK-1", name: "x", unit: "pcs" }), 1), 422, "VALIDATION", { field: "name" });
    await rejects(() => svc.stockInBatch(mk({ sku: "OK-1", name: "Valid", unit: "9bad" }), 1), 422, "VALIDATION", { field: "unit" });
    await rejects(() => svc.stockInBatch(mk({ sku: "OK-1", name: "Valid", unit: "pcs", minimum_stock_level: "-1" }), 1), 422, "VALIDATION", { field: "minimum_stock_level" });
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [
      { component_id: 1, quantity: "1", ...base }, { component_id: 1, quantity: "2", ...base }] }, 1), 422, "VALIDATION", { line: 1 });
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [
      { new_component: { sku: "N-1", name: "One", unit: "pcs" }, quantity: "1", ...base },
      { new_component: { sku: "n-1", name: "Two", unit: "pcs" }, quantity: "1", ...base }] }, 1), 422, "VALIDATION", { line: 1, field: "sku" });
    assert.strictEqual(st.ledger.length, 0); assert.strictEqual(st.components.length, 2);
  });

  await t("decimal maths has no float drift", async () => {
    st.inventory[0].quantity_on_hand = "0.10";
    const r = await svc.stockInBatch({ idempotency_key: K(), items: [{ component_id: 1, quantity: "0.20", ...base }] }, 1);
    assert.strictEqual(r.items[0].balance_after, "0.30");
  });

  await t("location / category / size: saved for new components, updated on existing, blank leaves them alone", async () => {
    await svc.stockInBatch({ idempotency_key: K(), items: [
      { component_id: 1, quantity: 1, location: "  Rack   A-2 ", category: "PCB", size: "10x20 cm", ...base },
      { new_component: { sku: "N-9", name: "Resistor 10k", unit: "pcs", category: " Resistor ", size: "0805" }, quantity: 5, location: "Bin 4", ...base },
    ] }, 1);
    assert.strictEqual(st.inventory.find((i) => i.component_id === 1).location, "Rack A-2");
    assert.strictEqual(st.components.find((c) => c.id === 1).category, "PCB");
    assert.strictEqual(st.components.find((c) => c.id === 1).size, "10x20 cm");
    const nc = st.components.find((c) => c.sku === "N-9");
    assert.strictEqual(nc.category, "Resistor"); assert.strictEqual(nc.size, "0805");
    await svc.stockInBatch({ idempotency_key: K(), items: [{ component_id: 1, quantity: 1, location: "", category: "", size: "", ...base }] }, 1);
    assert.strictEqual(st.inventory.find((i) => i.component_id === 1).location, "Rack A-2");
    assert.strictEqual(st.components.find((c) => c.id === 1).category, "PCB");
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ component_id: 1, quantity: 1, category: "x".repeat(101), ...base }] }, 1), 422, "VALIDATION", { line: 0, field: "category" });
    await rejects(() => svc.stockInBatch({ idempotency_key: K(), items: [{ component_id: 1, quantity: 1, location: "x".repeat(101), ...base }] }, 1), 422, "VALIDATION", { line: 0, field: "location" });
  });

  console.log(`\n${n} batch tests passed`);
})().catch((e) => { console.error("FAIL:", e.message); console.error(e.stack.split("\n").slice(0, 4).join("\n")); process.exit(1); });

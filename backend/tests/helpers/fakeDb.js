/**
 * In-memory stand-in for MySQL, used by inventory-batch.test.js.
 *
 * The service calls db.query(sql, params) / db.getConnection(); this answers from plain arrays.
 * It does not understand SQL: a handler is picked by the START of the query text, and only the
 * queries stockInBatch() runs exist here.
 *
 * KEEP IN SYNC: if inventory.service.js changes one of those queries (e.g. a new column in the ledger
 * INSERT), update the matching handler. The order of its params must mirror the service's query.
 */
const clone = (value) => JSON.parse(JSON.stringify(value));
const byId = (rows, id) => rows.find((row) => row.id === id);
const duplicateError = (message) => Object.assign(new Error(message), { errno: 1062 }); // MySQL "Duplicate entry"

let state;

/** Back to the starting tables. Called before every test. */
function reset() {
  state = {
    components: [
      { id: 1, sku: "CMP-001", name: "LED Display PCB", unit: "pcs" },
      { id: 2, sku: "CMP-002", name: "Red LED", unit: "pcs" },
    ],
    inventory: [
      { id: 1, component_id: 1, quantity_on_hand: "10.00", quantity_reserved: "0.00", is_active: 1 },
      { id: 2, component_id: 2, quantity_on_hand: "5.00", quantity_reserved: "0.00", is_active: 0 }, // archived
    ],
    ledger: [],
    nextComponentId: 3,
    nextInventoryId: 3,
    nextLedgerId: 1,
    lockOrder: [], // component ids in the order the service locked them
  };
}

// [start of the SQL, handler(params)] - each handler returns what mysql2 would return
const handlers = [
  // movements already posted with these idempotency keys (is this request a replay?)
  ["SELECT t.id, t.idempotency_key", ([keys]) => [
    state.ledger
      .filter((entry) => keys.includes(entry.idempotency_key))
      .map((entry) => {
        const { sku, name, unit } = byId(state.components, entry.component_id);
        return { ...entry, sku, name, unit };
      }),
  ]],

  // is this component name taken? (case-insensitive)
  ["SELECT sku FROM components WHERE name", ([name]) => [
    state.components.filter((c) => c.name.toLowerCase() === name.toLowerCase()).map((c) => ({ sku: c.sku })),
  ]],

  // new component (sku is UNIQUE)
  ["INSERT INTO components", ([sku, name, description, unit, min, category, size]) => {
    if (state.components.some((c) => c.sku === sku)) throw duplicateError("Duplicate entry for key 'components.sku'");
    const row = { id: state.nextComponentId++, sku, name, description, unit, min, category, size };
    state.components.push(row);
    return [{ insertId: row.id }];
  }],

  // which of these component ids exist?
  ["SELECT id FROM components WHERE id IN", ([ids]) => [
    state.components.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id })),
  ]],

  // make sure the component has an inventory row (0 stock if missing)
  ["INSERT INTO inventory (component_id", ([componentId]) => {
    if (!state.inventory.some((row) => row.component_id === componentId)) {
      state.inventory.push({
        id: state.nextInventoryId++,
        component_id: componentId,
        quantity_on_hand: "0.00",
        quantity_reserved: "0.00",
        is_active: 1,
      });
    }
    return [{}];
  }],

  // lock + read inventory rows (the service must lock in component-id order to avoid deadlocks)
  ["SELECT * FROM inventory WHERE component_id IN", ([componentIds]) => {
    state.lockOrder = componentIds.slice();
    return [state.inventory.filter((r) => componentIds.includes(r.component_id)).sort((a, b) => a.component_id - b.component_id)];
  }],

  // new stock level (also reactivates an archived item)
  ["UPDATE inventory SET quantity_on_hand = ?, is_active = 1", ([quantityOnHand, inventoryId]) => {
    Object.assign(byId(state.inventory, inventoryId), { quantity_on_hand: quantityOnHand, is_active: 1 });
    return [{ affectedRows: 1 }];
  }],

  ["UPDATE inventory SET location = ?", ([location, inventoryId]) => {
    byId(state.inventory, inventoryId).location = location;
    return [{ affectedRows: 1 }];
  }],

  // null keeps the stored value (SQL COALESCE)
  ["UPDATE components SET category = COALESCE", ([category, size, componentId]) => {
    const component = byId(state.components, componentId);
    component.category = category ?? component.category;
    component.size = size ?? component.size;
    return [{ affectedRows: 1 }];
  }],

  // one ledger row (idempotency_key is UNIQUE). Param order must match the service's INSERT column list.
  ["INSERT INTO inventory_transactions", (
    [componentId, type, direction, quantity, balanceAfter, reason, reasonCode, referenceNo, createdBy, orderId, key]
  ) => {
    if (state.ledger.some((entry) => entry.idempotency_key === key)) {
      throw duplicateError("Duplicate entry for key 'inventory_transactions.uq_inv_txn_idempotency'");
    }
    const row = {
      id: state.nextLedgerId++,
      component_id: componentId, type, direction, quantity,
      balance_after: balanceAfter, reason, reason_code: reasonCode, reference_no: referenceNo,
      created_by: createdBy, order_id: orderId, idempotency_key: key,
    };
    state.ledger.push(row);
    return [{ insertId: row.id }];
  }],

  ["SELECT id, sku, name, unit FROM components WHERE id IN", ([ids]) => [
    state.components.filter((c) => ids.includes(c.id)),
  ]],
];

function run(sql, params = []) {
  const query = sql.replace(/\s+/g, " ").trim();
  const match = handlers.find(([prefix]) => query.startsWith(prefix));
  if (!match) throw new Error("fake db: unhandled SQL: " + query);
  return match[1](params);
}

/*
  Transactions: begin waits for any running transaction (like a row lock) and takes a snapshot,
  rollback restores the snapshot, commit just lets the next one start.
*/
let lockQueue = Promise.resolve();

const fakeDb = {
  query: async (sql, params) => run(sql, params),
  getConnection: async () => {
    let snapshot;
    let unlock;
    return {
      beginTransaction: async () => {
        const previous = lockQueue;
        lockQueue = new Promise((resolve) => (unlock = resolve));
        await previous;
        snapshot = clone(state);
      },
      commit: async () => unlock?.(),
      rollback: async () => {
        Object.assign(state, snapshot);
        unlock?.();
      },
      release: () => {},
      query: async (sql, params) => run(sql, params),
    };
  },
};

// state() is a function because reset() replaces the tables
module.exports = { fakeDb, reset, state: () => state, clone };

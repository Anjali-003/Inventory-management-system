/**
 * Logic tests for POST /inventory/stock-in/batch (inventory.service.js -> stockInBatch).
 *   npm test             run once
 *   npm run test:watch   re-run on save
 * MySQL is replaced by tests/helpers/fakeDb.js: this proves the logic, not one real run against MySQL.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import fake from "./helpers/fakeDb.js";

// The service is CommonJS and require()s config/db, so the fake goes into the require cache BEFORE
// the service loads (vi.mock cannot intercept require()).
const require = createRequire(import.meta.url);
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fake.fakeDb };
const service = require("../src/store/inventory/inventory.service.js");

const { reset, state, clone } = fake;

const newKey = () => "key-" + Math.random().toString(36).slice(2, 14);
const purchase = { reason: "Purchase receipt", reference_no: "PO-1" };
/** A valid line for existing component 1; pass overrides to change it. */
const line = (overrides = {}) => ({ component_id: 1, quantity: "1", ...purchase, ...overrides });
/** A line that creates a new component. */
const newLine = (newComponent, overrides = {}) => ({ new_component: newComponent, quantity: "1", ...purchase, ...overrides });
const post = (items, userId = 1, key = newKey()) => service.stockInBatch({ idempotency_key: key, items }, userId);
const stockOf = (componentId) => Number(state().inventory.find((r) => r.component_id === componentId).quantity_on_hand);

/** Expects a failure: { status, code?, ...details } (details such as line / field are on error.extra). */
const reject = (promise, { status, code, ...extra }) =>
  expect(promise).rejects.toMatchObject({ status, ...(code && { code }), ...(Object.keys(extra).length && { extra }) });

beforeEach(reset);

describe("happy path", () => {
  // an existing component, an archived one and a brand-new one, received by user 7
  const mixedBatch = () =>
    post(
      [
        line({ quantity: "2.5" }),
        line({ component_id: 2, quantity: 10 }),
        newLine({ sku: "cmp-019", name: "  Blue   LED ", unit: "PCS", minimum_stock_level: "20" }, { quantity: "100" }),
      ],
      7
    );

  it("posts existing, archived and new components in one batch", async () => {
    const result = await mixedBatch();
    const { inventory, components } = state();

    expect(result).toMatchObject({ count: 3, replayed: false });
    expect(result.items.map((item) => item.balance_after).slice(0, 2)).toEqual(["12.50", "15.00"]);
    expect(inventory.find((r) => r.component_id === 2).is_active).toBe(1); // archived item reactivated
    expect(components.find((c) => c.sku === "CMP-019")).toMatchObject({ name: "Blue LED", unit: "pcs" }); // tidied
    expect(result.items[2]).toMatchObject({ created: true, sku: "CMP-019" });
  });

  it("writes one STOCK_IN ledger row per line and keeps ledger and inventory equal", async () => {
    await mixedBatch();
    const { ledger, inventory, lockOrder } = state();

    expect(ledger).toHaveLength(3);
    ledger.forEach((row) => expect(row).toMatchObject({ direction: "IN", type: "STOCK_IN", created_by: 7 }));

    const opening = { 1: 10, 2: 5 };
    for (const row of inventory) {
      const received = ledger.filter((l) => l.component_id === row.component_id).reduce((sum, l) => sum + Number(l.quantity), 0);
      expect(Number(row.quantity_on_hand)).toBe((opening[row.component_id] || 0) + received);
    }
    expect(lockOrder).toEqual([...lockOrder].sort((a, b) => a - b)); // rows locked in id order: no deadlocks
  });

  it("does decimal maths without float drift", async () => {
    state().inventory[0].quantity_on_hand = "0.10";

    const result = await post([line({ quantity: "0.20" })]);

    expect(result.items[0].balance_after).toBe("0.30"); // not 0.30000000000000004
  });
});

describe("location, category and size", () => {
  it("are saved for a new component and updated on an existing one", async () => {
    await post([
      line({ location: "  Rack   A-2 ", category: "PCB", size: "10x20 cm" }),
      newLine({ sku: "N-9", name: "Resistor 10k", unit: "pcs", category: " Resistor ", size: "0805" }, { location: "Bin 4" }),
    ]);
    const { inventory, components } = state();

    expect(inventory.find((r) => r.component_id === 1).location).toBe("Rack A-2");
    expect(components.find((c) => c.id === 1)).toMatchObject({ category: "PCB", size: "10x20 cm" });
    expect(components.find((c) => c.sku === "N-9")).toMatchObject({ category: "Resistor", size: "0805" });
  });

  it("keep their stored value when sent blank", async () => {
    await post([line({ location: "Rack A-2", category: "PCB" })]);

    await post([line({ location: "", category: "", size: "" })]);

    expect(state().inventory.find((r) => r.component_id === 1).location).toBe("Rack A-2");
    expect(state().components.find((c) => c.id === 1).category).toBe("PCB");
  });

  it.each(["category", "location"])("%s longer than 100 characters is rejected", async (field) => {
    await reject(post([line({ [field]: "x".repeat(101) })]), { status: 422, code: "VALIDATION", line: 0, field });
  });
});

describe("idempotency (a double click or retry must not post twice)", () => {
  const batch = () => ({
    idempotency_key: newKey(),
    items: [line({ quantity: "3" }), newLine({ sku: "NEW-1", name: "Thing", unit: "kg" }, { quantity: "4" })],
  });

  it("same key twice posts once and replays the same movements", async () => {
    const body = batch();

    const first = await service.stockInBatch(body, 1);
    const second = await service.stockInBatch(clone(body), 1);

    expect(second.replayed).toBe(true);
    expect(second.items.map((i) => i.movement_id)).toEqual(first.items.map((i) => i.movement_id));
    expect(state().ledger).toHaveLength(2);
    expect(state().components.filter((c) => c.sku === "NEW-1")).toHaveLength(1);
    expect(stockOf(1)).toBe(13);
  });

  it("same key with a different payload is refused (409)", async () => {
    const key = newKey();
    await post([line({ quantity: "3" })], 1, key);

    await reject(post([line({ quantity: "9" })], 1, key), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(state().ledger).toHaveLength(1);
  });

  it("two identical requests at the same time post once", async () => {
    const body = { idempotency_key: newKey(), items: [line({ quantity: "3" })] };

    await Promise.all([service.stockInBatch(body, 1), service.stockInBatch(body, 1)]);

    expect(state().ledger).toHaveLength(1);
    expect(stockOf(1)).toBe(13);
  });
});

describe("all-or-nothing", () => {
  it("a duplicate SKU (409) names the line and saves nothing, not even the lines before it", async () => {
    const before = clone(state());
    const items = [line({ quantity: "5" }), newLine({ sku: "CMP-002", name: "Totally New", unit: "pcs" })];

    await reject(post(items), { status: 409, code: "DUPLICATE_SKU", line: 1, field: "sku" });

    expect(state().ledger).toHaveLength(0);
    expect(state().inventory).toEqual(before.inventory);
    expect(state().components).toEqual(before.components);
  });

  it("a duplicate name, in any letter case, is refused with the line", async () => {
    await reject(post([newLine({ sku: "ZZ-1", name: "red led", unit: "pcs" })]), {
      status: 409, code: "DUPLICATE_NAME", line: 0, field: "name",
    });
    expect(state().components).toHaveLength(2);
  });

  it("an unknown component (404) posts nothing", async () => {
    await reject(post([line(), line({ component_id: 999 })]), { status: 404, code: "NOT_FOUND", line: 1 });
    expect(state().ledger).toHaveLength(0);
  });
});

describe("validation", () => {
  const valid = { sku: "OK-1", name: "Valid", unit: "pcs" };
  const badQuantities = ["0", "-3", "1.234", "abc", "", null, "99999999999"];

  // [what is wrong, the lines to send, the expected error]
  const cases = [
    ["an empty list", () => [], { status: 422 }],
    ["more than 50 lines", () => Array.from({ length: 51 }, (_, i) => line({ component_id: i + 1 })), { status: 422 }],
    ...badQuantities.map((quantity) => [
      `quantity ${JSON.stringify(quantity)}`,
      () => [line({ quantity })],
      { status: 422, code: "VALIDATION", line: 0, field: "quantity" },
    ]),
    ["a missing reason", () => [line({ reason: "" })], { status: 422, code: "VALIDATION", line: 0 }],
    ["a line with neither component_id nor new_component", () => [{ quantity: "1", ...purchase }], { status: 422 }],
    ["a line with both component_id and new_component", () => [line({ new_component: valid })], { status: 422 }],
    ["the same component twice", () => [line(), line({ quantity: "2" })], { status: 422, code: "VALIDATION", line: 1 }],
    ["a SKU with spaces", () => [newLine({ ...valid, sku: "a b" })], { status: 422, code: "VALIDATION", field: "sku" }],
    ["a one-letter name", () => [newLine({ ...valid, name: "x" })], { status: 422, code: "VALIDATION", field: "name" }],
    ["a unit starting with a digit", () => [newLine({ ...valid, unit: "9bad" })], { status: 422, code: "VALIDATION", field: "unit" }],
    ["a negative minimum stock level", () => [newLine({ ...valid, minimum_stock_level: "-1" })],
      { status: 422, code: "VALIDATION", field: "minimum_stock_level" }],
    ["two new components with the same SKU (any case)",
      () => [newLine({ ...valid, sku: "N-1", name: "One" }), newLine({ ...valid, sku: "n-1", name: "Two" })],
      { status: 422, code: "VALIDATION", line: 1, field: "sku" }],
  ];

  it.each(cases)("rejects %s and saves nothing", async (_what, makeItems, expected) => {
    await reject(post(makeItems()), expected);

    expect(state().ledger).toHaveLength(0);
    expect(state().components).toHaveLength(2);
  });

  it("rejects a missing idempotency key (400)", async () => {
    await reject(service.stockInBatch({ items: [line()] }, 1), { status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});

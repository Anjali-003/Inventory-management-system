/**
 * Order planner (sales/order-approvals/order-planner.js): "what can be built now, what is short?"
 *   npm test
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { planOrder } = require("../src/sales/order-approvals/order-planner.js");

// seed BOMs (product 1 = Smart Controller, 2 = Sensor Node)
const toBom = (rows) => rows.map(([component_id, quantity_per_unit]) => ({ component_id, quantity_per_unit }));
const bom = {
  1: toBom([[1, 4], [3, 6], [4, 2], [5, 3], [7, 1], [8, 2], [9, 1], [10, 1], [11, 1], [12, 1]]),
  2: toBom([[2, 3], [3, 4], [6, 2], [7, 1], [9, 1], [11, 1]]),
};
const plenty = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) => [id, 1000]));
const plan = (items, available, bomByProduct = bom) => planOrder({ items, bomByProduct, availableByComp: available });

describe("planOrder", () => {
  it("builds everything when stock is plentiful", () => {
    const r = plan([{ product_id: 1, quantity: 20 }, { product_id: 2, quantity: 10 }], plenty);
    expect(r.fully_producible).toBe(true);
    expect(r.shortages).toEqual([]);
    expect(r.lines.map((l) => l.can_make)).toEqual([20, 10]);
  });

  it("never promises the same shared component twice (first line gets it first)", () => {
    const r = plan([{ product_id: 1, quantity: 20 }, { product_id: 2, quantity: 10 }], { ...plenty, 7: 25 });
    expect(r.lines.map((l) => [l.can_make, l.remaining])).toEqual([[20, 0], [5, 5]]);
    expect(r.shortages).toHaveLength(1);
    expect(r.shortages[0]).toMatchObject({ component_id: 7, shortage: 5 });
  });

  it("reports the full need when nothing is in stock", () => {
    const r = plan([{ product_id: 2, quantity: 10 }], {});
    expect(r.lines[0].can_make).toBe(0);
    expect(r.fully_producible).toBe(false);
    expect(r.shortages.find((s) => s.component_id === 2).shortage).toBe(30);
  });

  it("counts leftover stock towards the shortage", () => {
    // 14 resistors, 3 per unit: 4 units made (12 used), 6 units remain needing 18, 2 left -> buy 16
    const r = plan([{ product_id: 2, quantity: 10 }], { ...plenty, 2: 14 });
    expect(r.lines[0].can_make).toBe(4);
    expect(r.shortages[0]).toMatchObject({ required: 18, available: 2, shortage: 16 });
  });

  it("flags a product without a BOM instead of guessing", () => {
    const r = plan([{ product_id: 99, quantity: 3 }], plenty);
    expect(r.missing_bom).toEqual([99]);
    expect(r.lines[0].has_bom).toBe(false);
    expect(r.fully_producible).toBe(false);
  });

  it("handles decimals without float drift", () => {
    // 0.8 kg per unit, 2 kg stock: 2 units (1.6 kg), 0.4 left, 1 unit still needs 0.8 -> short 0.4
    const r = plan([{ product_id: 5, quantity: 3 }], { 13: 2 }, { 5: [{ component_id: 13, quantity_per_unit: 0.8 }] });
    expect(r.lines[0].can_make).toBe(2);
    expect(r.shortages[0].shortage).toBe(0.4);
  });

  it("copes with a decimal order quantity", () => {
    const r = plan([{ product_id: 5, quantity: 10.1 }], { 13: 10 }, { 5: [{ component_id: 13, quantity_per_unit: 1 }] });
    expect(r.lines[0]).toMatchObject({ can_make: 10, remaining: 0.1 });
    expect(r.shortages[0].shortage).toBe(0.1);
  });
});

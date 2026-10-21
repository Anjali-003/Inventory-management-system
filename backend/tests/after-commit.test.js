/**
 * conn.afterCommit(): side effects (e.g. notifying the Store Manager) run only once the
 * transaction has really committed.   npm test
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fake from "./helpers/fakeDb.js";

const require = createRequire(import.meta.url);
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fake.fakeDb };
const { inTransaction } = require("../src/modules/inventory/inventory.service.js");

beforeEach(() => fake.reset());

describe("inTransaction afterCommit", () => {
  it("runs the hook after the commit, not before", async () => {
    const order = [];

    const hook = vi.fn(() => order.push("hook"));
    await inTransaction(async (conn) => {
      conn.afterCommit(hook);
      order.push("work");
      expect(hook).not.toHaveBeenCalled(); // still inside the transaction
    });
    order.push("returned");
    expect(order).toEqual(["work", "hook", "returned"]);
  });

  it("never runs the hook when the transaction rolls back", async () => {
    const hook = vi.fn();
    await expect(
      inTransaction(async (conn) => {
        conn.afterCommit(hook);
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(hook).not.toHaveBeenCalled();
  });

  it("does not fail the request when a hook throws (data is already committed)", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await inTransaction(async (conn) => {
      conn.afterCommit(() => {
        throw new Error("notify failed");
      });
      return "saved";
    });
    expect(result).toBe("saved");
    quiet.mockRestore();
  });
});

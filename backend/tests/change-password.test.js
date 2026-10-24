/**
 * A logged-in user changes their own password (auth.service changePassword).
 * MySQL is replaced by a one-user fake; bcrypt is the real one.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

let user;
const fakeDb = {
  query: async (sql, p) => {
    if (sql.includes("SELECT password_hash FROM users")) return [user.id === p[0] && user.is_active ? [{ password_hash: user.password_hash }] : []];
    if (sql.includes("UPDATE users SET password_hash")) { user.password_hash = p[0]; return [{ affectedRows: 1 }]; }
    throw new Error("fake db: unexpected query: " + sql);
  },
};
require.cache[require.resolve("../src/config/db.js")] = { id: "db", filename: "db", loaded: true, exports: fakeDb };
const auth = require("../src/modules/auth/auth.service.js");

beforeEach(async () => {
  user = { id: 4, is_active: 1, password_hash: await bcrypt.hash("old-secret-1", 4) };
});

describe("change own password", () => {
  it("saves the new password when the current one is right", async () => {
    await expect(auth.changePassword(4, "old-secret-1", "new-secret-2")).resolves.toMatchObject({ message: "Password changed" });
    expect(await bcrypt.compare("new-secret-2", user.password_hash)).toBe(true);
    expect(await bcrypt.compare("old-secret-1", user.password_hash)).toBe(false);
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const before = user.password_hash;
    await expect(auth.changePassword(4, "guess", "new-secret-2")).rejects.toMatchObject({ code: "WRONG_PASSWORD", extra: { field: "current_password" } });
    expect(user.password_hash).toBe(before);
  });

  it("refuses a short, missing or unchanged new password", async () => {
    await expect(auth.changePassword(4, "old-secret-1", "short")).rejects.toMatchObject({ extra: { field: "new_password" } });
    await expect(auth.changePassword(4, "", "new-secret-2")).rejects.toMatchObject({ extra: { field: "current_password" } });
    await expect(auth.changePassword(4, "old-secret-1", "old-secret-1")).rejects.toMatchObject({ extra: { field: "new_password" } });
  });

  it("refuses an account that is no longer active", async () => {
    user.is_active = 0;
    await expect(auth.changePassword(4, "old-secret-1", "new-secret-2")).rejects.toMatchObject({ status: 401 });
  });
});

/**
 * "View as" (shared/requestContext.js + notification.service.js): when the Super Admin does a role's work through
 * "View as", the next role's notification also comes to him (open tabs + phone) with viewAs = that role, so opening
 * it switches his view. Without "View as", or for anyone else, nothing changes.
 * MySQL, the live stream and web push are replaced by small fakes.
 */
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
let sent;
const ROLES = { 1: "SUPER_ADMIN", 2: "STORE_MANAGER" };

const conn = {
  query: async (sql, p) => {
    if (sql.startsWith("SELECT role FROM users")) return [[ROLES[p[0]] ? { role: ROLES[p[0]] } : undefined]];
    if (sql.includes("INSERT INTO notifications")) return [{ insertId: 77 }];
    throw new Error(`fake db: unexpected SQL: ${sql}`);
  },
};
const fake = (name, exports) => { require.cache[require.resolve(name)] = { id: name, filename: name, loaded: true, exports }; };
fake("../src/config/db.js", { query: conn.query, getConnection: async () => conn });
fake("../src/realtime/hub.js", {
  notifyRole: (role, data) => sent.push(["tab-role", role, data]),
  notifyUser: (userId, data) => sent.push(["tab-user", userId, data]),
  broadcast: () => {},
});
fake("../src/modules/push/push.service.js", {
  sendToRole: (role, msg) => sent.push(["push-role", role, msg]),
  sendToUser: (userId, role, msg) => sent.push(["push-user", userId, role, msg]),
});
const notifications = require("../src/modules/notifications/notification.service.js");
const requestContext = require("../src/shared/requestContext.js");

// runs notify() as if inside a request with (or without) the X-View-As header
const inRequest = (viewAs, fn) =>
  new Promise((resolve, reject) => requestContext.middleware({ get: () => viewAs }, {}, () => fn().then(resolve, reject)));
const settle = () => new Promise((r) => setTimeout(r, 10));
const MSG = { role: "MARKETING_MANAGER", type: "FINISHED_GOODS_IN_STORE", title: "Order ORD-1 is in the Store", link: "/finished-goods" };

beforeEach(() => { sent = []; });

describe("notifications while the Super Admin works in View as", () => {
  it("also sends the next role's notification to him, saying which role to switch to", async () => {
    await inRequest("STORE_MANAGER", () => notifications.notify(conn, { ...MSG, userId: 1 }));
    await settle();
    const tab = sent.find((s) => s[0] === "tab-user");
    const push = sent.find((s) => s[0] === "push-user");
    expect(tab).toMatchObject([ "tab-user", 1, { viewAs: "MARKETING_MANAGER", title: MSG.title, link: "/finished-goods" } ]);
    expect(push).toMatchObject([ "push-user", 1, "SUPER_ADMIN", { viewAs: "MARKETING_MANAGER" } ]);
    // Marketing itself is still told as before
    expect(sent.some((s) => s[0] === "push-role" && s[1] === "MARKETING_MANAGER")).toBe(true);
  });

  it("changes nothing for the Super Admin outside View as", async () => {
    await inRequest("", () => notifications.notify(conn, { ...MSG, userId: 1 }));
    await settle();
    expect(sent.some((s) => s[0] === "tab-user" || s[0] === "push-user")).toBe(false);
  });

  it("changes nothing for other users, even if they send the header", async () => {
    await inRequest("MARKETING_MANAGER", () => notifications.notify(conn, { ...MSG, userId: 2 }));
    await settle();
    expect(sent.some((s) => s[0] === "tab-user" || s[0] === "push-user")).toBe(false);
  });
});

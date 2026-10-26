/**
 * The role table is written twice: backend/src/middleware/permissions.js (what the API allows) and
 * frontend/src/lib/permissions.js (which pages and buttons a role sees). If they drift apart, a role sees a page it
 * cannot use (403s) or cannot see a page it is allowed to use. This test fails the moment they disagree.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { canEdit, canView, getViewAs, ROLES, setViewAs, subscribeViewAs } from "../../frontend/src/lib/permissions.js";

const require = createRequire(import.meta.url);
const backend = require("../src/middleware/permissions.js");

// frontend-only page keys (no API module of that name) and backend-only API modules (no page of that name)
const FRONTEND_ONLY = new Set(["dashboard", "storeMaterialRequests", "activity", "orders"]);
const BACKEND_ONLY = new Set(["materialRequests"]);

const level = (view, edit) => (edit ? "edit" : view ? "view" : null);
const modulesOf = (rule) => (rule === "*" ? [] : Object.keys(rule));

describe("frontend and backend role tables agree", () => {
  const modules = new Set(Object.values(backend.ACCESS).flatMap(modulesOf));

  it("knows the same roles", () => {
    expect(Object.keys(ROLES).sort()).toEqual([...backend.ROLE_NAMES].sort());
  });

  for (const role of backend.ROLE_NAMES) {
    it(`${role}: same access to every shared module`, () => {
      const diffs = [];
      for (const module of modules) {
        if (FRONTEND_ONLY.has(module) || BACKEND_ONLY.has(module)) continue;
        const api = backend.levelOf(role, module);
        const ui = level(canView(role, module), canEdit(role, module));
        if (api !== ui) diffs.push(`${module}: api=${api} ui=${ui}`);
      }
      expect(diffs).toEqual([]);
    });
  }

  it("the Store page for production material follows the API module", () => {
    // the Store's "Issue to Production" page (storeMaterialRequests) uses the materialRequests API
    for (const role of backend.ROLE_NAMES) {
      if (canView(role, "storeMaterialRequests")) expect(backend.levelOf(role, "materialRequests")).not.toBeNull();
    }
  });
});

describe("Super Admin \"View as\" (per tab, no extra login)", () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

  it("remembers the picked role and tells the screens", () => {
    let calls = 0;
    const stop = subscribeViewAs(() => calls++);
    setViewAs("STORE_MANAGER");
    expect(getViewAs()).toBe("STORE_MANAGER");
    setViewAs(null);
    expect(getViewAs()).toBe(null);
    stop();
    expect(calls).toBe(2);
  });

  it("never 'views as' the Super Admin itself or an unknown role", () => {
    setViewAs("SUPER_ADMIN");
    expect(getViewAs()).toBe(null);
    store.set("ims_view_as", "NOT_A_ROLE");
    expect(getViewAs()).toBe(null);
  });

  it("the picked role's own access applies (e.g. Store cannot edit production)", () => {
    expect(canEdit("STORE_MANAGER", "production")).toBe(false);
    expect(canView("STORE_MANAGER", "incomingStock")).toBe(true);
  });
});

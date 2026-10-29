/*
  The API the screens talk to in tests: every request is answered here, in the browser, from a small table.

    respond("GET", "/marketing-orders", [order1, order2])   // this test's answer for that path
    respond("POST", /\/send$/, { ok: true })                // a RegExp matches any path it fits
    requests                                                // every request made so far: { method, url, data }

  Anything not set gets a harmless default: the logged-in user, empty lists, zero figures. Reset before each test.
*/
let role = "SUPER_ADMIN";
let table = [];
export const requests = [];

const ZERO_SALES = { month: "", net: 0, billed: 0, credited: 0, bills: 0, collected: 0, payments: 0, toCollect: 0, owed: [], ageing: [0, 0, 0, 0], lastMonth: { net: 0, collected: 0 }, byCustomer: [], subtotal: 0, toBill: 0 };

// an empty month, exactly as the backend sends it (GET /reports/monthly?month=2020-01 on an empty database)
const EMPTY_MONTH = {
  month: "2020-01",
  sales: { bills: 0, total: 0, gst: 0, credited: 0, creditNotes: 0, net: 0, collected: 0, payments: 0, toCollect: 0, owed: [], ageing: [0, 0, 0, 0], byCustomer: [], subtotal: 0 },
  money: { spent: 0, purchases: 0, soldFor: 0, costOfSold: 0, products: [], profit: null, marginPct: null, unpricedProducts: 0, estimatedProducts: 0 },
  suppliers: { received: 0, rejected: 0, rejectedPct: null, due: 0, late: 0, bySupplier: [] },
  qualityCheck: { firstTryBatches: 0, firstTryPassed: 0, firstTryPassPct: null, decisions: 0, failed: 0, failsByProduct: [] },
  orderTime: { delivered: 0, avgDays: null, avgApprovalDays: null, avgBuildDays: null, avgDispatchDays: null, slowest: [] },
};

// answers for paths whose screen expects an object, not a list
const DEFAULTS = [
  ["GET", /^\/auth\/me$/, () => ({ id: 1, name: "Test User", email: "test@test.local", role })],
  ["GET", /^\/notifications$/, () => ({ items: [], unread: 0, total: 0 })],
  ["GET", /^\/sales\/summary$/, () => ZERO_SALES],
  ["GET", /^\/reports\/monthly$/, () => EMPTY_MONTH],
];

export function resetFakeApi(asRole = "SUPER_ADMIN") {
  role = asRole;
  table = [];
  requests.length = 0;
}

/** The role /auth/me answers with (the screens follow it). Keeps the answers already set. */
export function setRole(asRole) {
  role = asRole;
}

export function respond(method, path, data) {
  table.unshift([method.toUpperCase(), path, () => data]);
}

const matches = (want, path) => (want instanceof RegExp ? want.test(path) : want === path);

/** axios adapter: put on the app's axios instance by setup.js. */
export async function fakeAdapter(config) {
  const method = String(config.method || "get").toUpperCase();
  const path = String(config.url || "").split("?")[0].replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "");
  const data = typeof config.data === "string" ? safeJson(config.data) : config.data;
  requests.push({ method, url: path, data });

  const hit = [...table, ...DEFAULTS].find(([m, p]) => m === method && matches(p, path));
  const body = hit ? hit[2]() : method === "GET" ? [] : {};
  return { data: body, status: 200, statusText: "OK", headers: {}, config, request: {} };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

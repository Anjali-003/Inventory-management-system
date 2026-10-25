/*
  npm run e2e   ->  one order through EVERY role, over the real HTTP API, on a throw-away copy of the database.

  1. builds <DB_NAME>_e2e from schema.sql and copies users, products, components and BOMs from the real database
     (the real database is only read, never written)
  2. starts the API on a free port and, signed in as each role in turn, walks one order from Marketing to delivery,
     plus a cancelled order, an extra-material ask and the checks that must refuse (wrong role, partial handover ...)
  3. prints one line per step and exits with code 1 when any step fails; the e2e database is dropped at the end
*/
const fs = require("fs");
const path = require("path");
require("dotenv").config({ quiet: true });

const LIVE_DB = process.env.DB_NAME;
const E2E_DB = `${LIVE_DB}_e2e`;
process.env.DB_NAME = E2E_DB; // everything required below talks to the copy

const { connect } = require("../database/lib/connection");
const jwt = require("jsonwebtoken");

let failures = 0;
const ok = (label, pass, extra = "") => {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${extra ? `  (${extra})` : ""}`);
};

async function buildCopy() {
  const admin = await connect({ withDatabase: false, multipleStatements: true });
  const sql = fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8")
    .replace(/^\s*CREATE\s+DATABASE\b[^;]*;/gim, "")
    .replace(/^\s*USE\s+[^;]*;/gim, "");
  await admin.query(`DROP DATABASE IF EXISTS \`${E2E_DB}\`; CREATE DATABASE \`${E2E_DB}\`; USE \`${E2E_DB}\`;`);
  await admin.query(sql);
  for (const table of ["users", "components", "products", "product_bom"]) {
    await admin.query(`INSERT INTO \`${E2E_DB}\`.\`${table}\` SELECT * FROM \`${LIVE_DB}\`.\`${table}\``);
  }
  // plenty of every component, written through the ledger like a real stock-in
  await admin.query(`INSERT INTO \`${E2E_DB}\`.inventory (component_id, quantity_on_hand, quantity_reserved) SELECT id, 100000, 0 FROM \`${E2E_DB}\`.components`);
  await admin.query(`INSERT INTO \`${E2E_DB}\`.inventory_transactions (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
                     SELECT id, 'STOCK_IN', 'IN', 100000, 100000, 'e2e opening stock', NULL FROM \`${E2E_DB}\`.components`);
  await admin.end();
}

async function dropCopy() {
  const admin = await connect({ withDatabase: false });
  await admin.query(`DROP DATABASE IF EXISTS \`${E2E_DB}\``);
  await admin.end();
}

async function main() {
  await buildCopy();
  const env = require("../config/env");
  const db = require("../config/db");
  const { createApp, API_VERSION_PREFIX } = require("../app");
  const { cookieNameFor } = require("../shared/session");
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}${API_VERSION_PREFIX}`;

  try {
    const [users] = await db.query("SELECT id, email, role FROM users WHERE is_active = 1 ORDER BY id");
    const as = (role) => async (method, url, body) => {
      const u = users.find((x) => x.role === role);
      if (!u) throw new Error(`no active ${role} user to sign in as`);
      const token = jwt.sign({ userId: u.id, email: u.email, role }, env.jwt.secret, { expiresIn: "10m" });
      const res = await fetch(base + url, {
        method,
        headers: { "content-type": "application/json", "x-login-role": role, cookie: `${cookieNameFor(role)}=${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };
    const MKT = as("MARKETING_MANAGER"), OPS = as("OPERATIONS_ADMIN"), PROD = as("PRODUCTION_MANAGER"),
      STORE = as("STORE_MANAGER"), QC = as("QUALITY_FG_MANAGER"), SA = as("SUPER_ADMIN");
    const key = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stage = async (id) => (await OPS("GET", "/order-tracker")).data.find((o) => o.id === id);

    // a product with a complete BOM
    const [[product]] = await db.query(
      `SELECT p.id, p.name FROM products p JOIN product_bom b ON b.product_id = p.id
       WHERE p.is_active = 1 AND b.quantity_required > 0 GROUP BY p.id ORDER BY p.id LIMIT 1`
    );
    const UNITS = 4;

    /* ---- 1. Marketing raises the order, Operations Admin approves it ---- */
    const created = await MKT("POST", "/marketing-orders", { items: [{ productId: product.id, quantity: UNITS }], estimated_delivery_date: "2026-12-31" });
    const orderId = created.data?.id;
    ok("Marketing creates an order", created.status === 201 && orderId, `${product.name} x ${UNITS}`);
    ok("Marketing sends it to Operations Admin", (await MKT("POST", `/marketing-orders/${orderId}/send`)).status === 200);
    ok("Tracker: waiting for Operations Admin", (await stage(orderId))?.waitingFor === "OPERATIONS_ADMIN");

    const plan = (await OPS("GET", `/order-approvals/${orderId}/plan`)).data;
    const send = await OPS("POST", `/order-approvals/${orderId}/dispatch`, {
      idempotency_key: key("dispatch"),
      expected_round: plan.approval_round,
      production_items: plan.lines.filter((l) => l.can_make > 0).map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
      purchase_items: plan.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })),
    });
    ok("Operations Admin approves (stock taken from shelf)", send.status === 200, `can make ${plan.lines[0]?.can_make}`);
    ok("Marketing cannot approve", (await MKT("POST", `/order-approvals/${orderId}/dispatch`, {})).status === 403);

    /* ---- 2. Production asks for material, Store must hand over all of it ---- */
    const [[line]] = await db.query("SELECT id FROM order_items WHERE order_id = ?", [orderId]);
    const options = (await PROD("GET", `/material-requests/options/${line.id}`)).data;
    const asked = await PROD("POST", "/material-requests", {
      order_item_id: line.id, product_quantity: UNITS, request_key: key("req"),
      items: options.items.map((i) => ({ component_id: i.component_id, quantity: Number((i.quantity_per_product * UNITS).toFixed(2)) })),
    });
    ok("Production asks Store for material", asked.status === 201, `${options.items.length} components`);
    const request = (await STORE("GET", "/material-requests")).data.find((r) => r.order_id === orderId);
    const allOf = (units) => request.items.map((i) => ({ request_item_id: i.id, quantity: Number((Number(i.quantity_per_product) * units).toFixed(2)) }));
    const partial = await STORE("POST", `/material-requests/${request.id}/issue`, { items: allOf(1), product_quantity: 1, idempotency_key: key("iss") });
    ok("Store cannot hand over only part", partial.status === 409, partial.data?.code);
    ok("Store hands over the full request", (await STORE("POST", `/material-requests/${request.id}/issue`, { items: allOf(UNITS), product_quantity: UNITS, idempotency_key: key("iss") })).status === 200);

    /* ---- 3. Production builds; a damaged piece needs extra material ---- */
    ok("Production starts building", (await PROD("POST", `/orders/${line.id}/start-production`, { quantity: UNITS })).status < 300);
    ok("Production cannot change stock by hand", (await PROD("POST", "/inventory/stock-in", {})).status === 403);
    ok("Store cannot change stock by hand", (await STORE("POST", "/inventory/stock-in", {})).status === 403);
    const comp = options.items[0];
    const extra = await PROD("POST", "/extra-materials", { order_id: orderId, component_id: comp.component_id, quantity: 2, reason_code: "DAMAGED", reason: "2 pieces burnt while soldering" });
    ok("Production asks extra material with a reason", extra.status === 201);
    ok("Store issues the extra material", (await STORE("POST", `/extra-materials/${extra.data.id}/issue`, {})).status === 200);
    const run = (await PROD("GET", "/production")).data.find((r) => r.order_item_id === line.id);
    ok("Production records the finished units", (await PROD("POST", `/production/${run.id}/update-progress`, { quantity: UNITS })).status < 300);
    ok("Tracker: waiting for QC", (await stage(orderId))?.waitingFor === "QUALITY_FG_MANAGER", (await stage(orderId))?.stage);

    /* ---- 4. QC checks sample pieces ---- */
    const badPass = await QC("POST", `/quality-control/${run.id}/decision`, { decision: "PASS", sample_size: 3, sample_failed: 1 });
    ok("QC cannot pass a batch with a failed sample piece", badPass.status === 400);
    ok("QC passes the batch (3 sample pieces, all good)", (await QC("POST", `/quality-control/${run.id}/decision`, { decision: "PASS", sample_size: 3, sample_failed: 0 })).status === 201);

    /* ---- 5. After QC: one owner per step ---- */
    const fg = (await MKT("GET", "/finished-goods")).data.find((f) => f.orderId === orderId);
    ok("Order reaches Finished Goods", fg?.status === "PACKAGING");
    ok("Store cannot do QC & FG's packing", (await STORE("POST", `/finished-goods/${fg.id}/pack`)).status === 403);
    ok("QC & FG packs", (await QC("POST", `/finished-goods/${fg.id}/pack`)).status === 200);
    ok("Operations Admin hands over to Store", (await OPS("POST", `/finished-goods/${fg.id}/hand-over`)).status === 200);
    const before = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand ?? 0;
    ok("Store receives into product stock", (await STORE("POST", `/finished-goods/${fg.id}/receive`)).status === 200);
    const after = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand;
    ok("Product stock went up by the order", after - before === UNITS, `${before} -> ${after}`);
    const customer = await MKT("POST", "/customers", { name: `E2E Customer ${Date.now()}`, gstin: "27ABCDE1234F1Z5" });
    ok("Marketing saves a customer", customer.status === 201);
    const bill = await MKT("POST", `/finished-goods/${fg.id}/bill`, { customer_id: customer.data.id, customer_name: customer.data.name, gst_percent: 18, items: [{ product_id: product.id, rate: 250 }] });
    ok("Marketing makes the bill", bill.status === 201, bill.data?.billNumber);
    ok("Store gives out for delivery", (await STORE("POST", `/finished-goods/${fg.id}/dispatch`, { note: "e2e truck" })).status === 200);
    ok("Product stock went back down", (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand === before);
    ok("Marketing confirms delivery", (await MKT("POST", `/finished-goods/${fg.id}/deliver`)).status === 200);
    ok("Tracker: delivered, waiting for nobody", (await stage(orderId))?.done === true);
    const journey = (await SA("GET", `/order-tracker/${orderId}`)).data;
    ok("Journey lists every step", journey?.events?.length >= 15, `${journey?.events?.length} events`);

    /* ---- 6. A second order is approved, then cancelled: its stock comes back ---- */
    const o2 = (await MKT("POST", "/marketing-orders", { items: [{ productId: product.id, quantity: 2 }], estimated_delivery_date: "2026-12-31" })).data.id;
    await MKT("POST", `/marketing-orders/${o2}/send`);
    const plan2 = (await OPS("GET", `/order-approvals/${o2}/plan`)).data;
    await OPS("POST", `/order-approvals/${o2}/dispatch`, {
      idempotency_key: key("dispatch"), expected_round: plan2.approval_round,
      production_items: plan2.lines.filter((l) => l.can_make > 0).map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
      purchase_items: plan2.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })),
    });
    const [[stock1]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
    ok("Marketing cannot cancel", (await MKT("POST", `/order-approvals/${o2}/cancel`, { remarks: "nope" })).status === 403);
    const cancel = await OPS("POST", `/order-approvals/${o2}/cancel`, { remarks: "Customer cancelled on the phone" });
    const [[stock2]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
    ok("Operations Admin cancels the approved order", cancel.status === 200, `${cancel.data?.returned_components} components back`);
    ok("Its stock came back", Number(stock2.s) > Number(stock1.s));
    ok("A cancelled order leaves the Production list", !(await PROD("GET", "/production")).data.some((r) => r.order_id === o2));

    /* ---- 7. The books still balance; the month report sees the sale ---- */
    const balance = (await SA("GET", "/inventory/history/balance")).data;
    ok("Inventory History: nothing unexplained", Number(balance.shortfall.unexplained) === 0, `in production ${balance.shortfall.in_production}, with reason ${balance.shortfall.explained_total}`);
    const month = new Date().toISOString().slice(0, 7);
    const report = (await SA("GET", `/reports/monthly?month=${month}`)).data;
    ok("Report counts the sale", report.sales.total > 0 && report.orderTime.delivered === 1, `₹${report.sales.total}`);
    ok("Report: QC passed first try", report.qualityCheck.firstTryPassPct === 100);
  } finally {
    server.close();
    await db.end().catch(() => {});
  }
}

main()
  .catch((error) => { failures++; console.error("FAIL", error); })
  .finally(async () => {
    await dropCopy().catch((e) => console.error("could not drop the e2e database:", e.message));
    console.log(failures ? `\n${failures} step(s) failed` : "\nall steps passed");
    process.exit(failures ? 1 : 0);
  });

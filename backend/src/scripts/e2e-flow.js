/*
  npm run e2e   ->  one order through EVERY role, over the real HTTP API, on a throw-away copy of the database.

  1. builds <DB_NAME>_e2e from schema.sql and copies users, products, components and BOMs from the real database
     (the real database is only read, never written)
  2. starts the API on a free port and, signed in as each role in turn, walks one order from Marketing to delivery,
     plus a cancelled order, an extra-material ask and the checks that must refuse (wrong role, partial handover ...)
  3. prints one line per step and exits with code 1 when any step fails; the e2e database is dropped at the end

  E2E_ONE_ROLE=SUPER_ADMIN npm run e2e  ->  the same walk with EVERY step done by that one role (the CEO doing each
  team's work); the "wrong role is refused" checks are skipped then.
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
const ONE_ROLE = process.env.E2E_ONE_ROLE || null;
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
    const as = (wanted) => async (method, url, body) => {
      const role = ONE_ROLE || wanted;
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
    ok("Super Admin sets the price list", (await SA("PUT", `/products/${product.id}/price`, { selling_price: 250, gst_percent: 18 })).status === 200, "₹250 + 18% GST");
    if (!ONE_ROLE) ok("Marketing cannot change the price list", (await MKT("PUT", `/products/${product.id}/price`, { selling_price: 1, gst_percent: 18 })).status === 403);

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
    if (!ONE_ROLE) ok("Marketing cannot approve", (await MKT("POST", `/order-approvals/${orderId}/dispatch`, {})).status === 403);

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
    if (!ONE_ROLE) ok("Production cannot change stock by hand", (await PROD("POST", "/inventory/stock-in", {})).status === 403);
    if (!ONE_ROLE) ok("Store cannot change stock by hand", (await STORE("POST", "/inventory/stock-in", {})).status === 403);
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
    ok("QC pass sends the packed order straight to the Store", fg?.status === "HANDED_OVER");
    ok("Tracker: waiting for Store", (await stage(orderId))?.waitingFor === "STORE_MANAGER", (await stage(orderId))?.stage);
    if (!ONE_ROLE) ok("Marketing cannot receive into Store", (await MKT("POST", `/finished-goods/${fg.id}/receive`)).status === 403);
    const before = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand ?? 0;
    ok("Store receives into product stock", (await STORE("POST", `/finished-goods/${fg.id}/receive`)).status === 200);
    const after = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand;
    ok("Product stock went up by the order", after - before === UNITS, `${before} -> ${after}`);
    const customer = await MKT("POST", "/customers", { name: `E2E Customer ${Date.now()}`, gstin: "27ABCDE1234F1Z5" });
    ok("Marketing saves a customer", customer.status === 201);
    const billBody = (rate, note) => ({ customer_id: customer.data.id, customer_name: customer.data.name, items: [{ product_id: product.id, rate, note }] });
    const noReason = await MKT("POST", `/finished-goods/${fg.id}/bill`, billBody(200));
    ok("A rate below the price list needs a reason", noReason.status === 422, noReason.data?.code);
    const first = await MKT("POST", `/finished-goods/${fg.id}/bill`, billBody(200, "Old customer, bulk order"));
    ok("Marketing bills with a discount and its reason", first.status === 201, first.data?.billNumber);
    if (!ONE_ROLE) ok("Marketing cannot cancel a bill", (await MKT("POST", `/finished-goods/${fg.id}/bill/cancel`, { reason: "try" })).status === 403);
    ok("Super Admin cancels the bill (goods still in Store)", (await SA("POST", `/finished-goods/${fg.id}/bill/cancel`, { reason: "Wrong rate on the bill" })).status === 201);
    const bill = await MKT("POST", `/finished-goods/${fg.id}/bill`, billBody(250));
    ok("Marketing makes the bill again at the list price", bill.status === 201, `${bill.data?.billNumber}: 4 x 250 + 18% = 1180`);
    const today = new Date().toISOString().slice(0, 10);
    const unpaid = await STORE("POST", `/finished-goods/${fg.id}/dispatch`, { note: "e2e truck" });
    ok("Store cannot give out an unpaid order", unpaid.status === 409 && unpaid.data?.code === "PAYMENT_DUE", unpaid.data?.code);
    ok("Marketing records a part payment", (await MKT("POST", `/finished-goods/${fg.id}/payments`, { amount: 500, paid_on: today, method: "UPI", reference: "UTR123" })).status === 201);
    ok("A payment above what is due is refused", (await MKT("POST", `/finished-goods/${fg.id}/payments`, { amount: 5000, paid_on: today, method: "CASH" })).status === 409);
    ok("Part paid is still not enough to give out", (await STORE("POST", `/finished-goods/${fg.id}/dispatch`, {})).data?.code === "PAYMENT_DUE");
    ok("Marketing collects the rest", (await MKT("POST", `/finished-goods/${fg.id}/payments`, { amount: 680, paid_on: today, method: "BANK" })).status === 201);
    ok("Store gives out for delivery once fully paid", (await STORE("POST", `/finished-goods/${fg.id}/dispatch`, { note: "e2e truck" })).status === 200);
    const moves = (await STORE("GET", "/product-stock/movements")).data;
    ok("Product stock history links the order", moves.length > 0 && moves.every((m) => m.orderId === orderId), `${moves.length} moves`);
    ok("Product stock went back down", (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand === before);
    const done = (await MKT("GET", `/finished-goods/${fg.id}`)).data;
    ok("Giving out completes the order", done.status === "DELIVERED" && (await stage(orderId))?.waitingFor === null, (await stage(orderId))?.stage);
    ok("Super Admin makes a credit note (1 piece returned)", (await SA("POST", `/finished-goods/${fg.id}/credit-note`, { amount: 295, reason: "1 piece returned damaged" })).status === 201);
    const paidBill = (await MKT("GET", `/finished-goods/${fg.id}/bill`)).data;
    ok("Bill: 1180 paid, 295 credit = 295 to give back", paidBill.due === 0 && paidBill.refund === 295 && paidBill.paymentStatus === "PAID", `refund ${paidBill.refund}`);

    /* ---- Sales & Billing (Marketing) ---- */
    const billsList = (await MKT("GET", "/sales/bills")).data;
    const active = billsList.find((b) => b.finishedGoodsId === fg.id && b.status === "ACTIVE");
    const cancelledBill = billsList.find((b) => b.finishedGoodsId === fg.id && b.status === "CANCELLED");
    ok("Bills list: the bill, paid in full after the credit note", active?.paymentStatus === "PAID" && active.net === 885 && active.due === 0, `${active?.billNumber} net ${active?.net}`);
    ok("Bills list keeps the cancelled bill with its reason", cancelledBill?.paymentStatus === "CANCELLED" && !!cancelledBill.cancelReason);
    const sales = (await MKT("GET", "/sales/summary")).data;
    ok("Marketing sees this month's sales and money in", sales.net === 885 && sales.collected === 1180 && sales.toCollect === 0);
    const paid = (await MKT("GET", "/sales/payments")).data;
    ok("Received this month: the 2 payments behind it, adding up to the figure", paid.length === 2 && paid.reduce((s, p) => s + p.amount, 0) === sales.collected && paid.every((p) => p.billNumber), `${paid.length} payments`);
    const customerRow = (await MKT("GET", "/customers")).data.find((c) => c.id === customer.data.id);
    ok("Customer shows what it bought and owes", customerRow?.bought === 885 && customerRow.due === 0 && customerRow.bills === 1, `bought ${customerRow?.bought}`);
    ok("Marketing edits the customer", (await MKT("PUT", `/customers/${customer.data.id}`, { name: customer.data.name, phone: "9876543210" })).status === 200);
    if (!ONE_ROLE) ok("Store cannot open Sales & Billing", (await STORE("GET", "/sales/bills")).status === 403);
    if (!ONE_ROLE) ok("Operations Admin can look at the bills", (await OPS("GET", "/sales/bills")).status === 200);
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
    if (!ONE_ROLE) ok("Marketing cannot cancel", (await MKT("POST", `/order-approvals/${o2}/cancel`, { remarks: "nope" })).status === 403);
    const cancel = await OPS("POST", `/order-approvals/${o2}/cancel`, { remarks: "Customer cancelled on the phone" });
    const [[stock2]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
    ok("Operations Admin cancels the approved order", cancel.status === 200, `${cancel.data?.returned_components} components back`);
    ok("Its stock came back", Number(stock2.s) > Number(stock1.s));
    ok("A cancelled order leaves the Production list", !(await PROD("GET", "/production")).data.some((r) => r.order_id === o2));

    /* ---- 6b. A component runs out: Purchase buys it, IQC checks it, Store accepts it ---- */
    const PUR = as("PURCHASE_MANAGER"), IQC = as("IQC_MANAGER");
    const [[inv]] = await db.query("SELECT id, quantity_on_hand FROM inventory WHERE component_id = ?", [comp.component_id]);
    const emptied = await SA("POST", `/inventory/${inv.id}/stock-out`, {
      quantity: Number(inv.quantity_on_hand), reason: "e2e: sent back so the next order is short", reason_code: "RETURNED_TO_SUPPLIER", idempotency_key: key("out"),
    });
    ok("Super Admin corrects stock by hand, with a reason", emptied.status < 300, `${emptied.status} ${emptied.data?.message || ""}`);
    const o3 = (await MKT("POST", "/marketing-orders", { items: [{ productId: product.id, quantity: 2 }], estimated_delivery_date: "2026-12-31" })).data.id;
    await MKT("POST", `/marketing-orders/${o3}/send`);
    const plan3 = (await OPS("GET", `/order-approvals/${o3}/plan`)).data;
    ok("Approval plan shows the short component", plan3.shortages.some((x) => x.component_id === comp.component_id), `${plan3.shortages.length} short`);
    await OPS("POST", `/order-approvals/${o3}/dispatch`, {
      idempotency_key: key("dispatch"), expected_round: plan3.approval_round,
      production_items: plan3.lines.filter((l) => l.can_make > 0).map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
      purchase_items: plan3.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })),
    });
    ok("Tracker: waiting for Purchase", (await stage(o3))?.waitingFor === "PURCHASE_MANAGER", (await stage(o3))?.stage);
    const approved = (await PUR("GET", "/approved-orders")).data.find((o) => o.id === o3);
    const toBuy = approved?.purchase_request?.items ?? [];
    const po = await PUR("POST", "/purchase", {
      supplier: "E2E Components", expected_delivery_date: "2026-12-15",
      items: toBuy.map((i) => ({ component_id: i.component_id, quantity: Math.ceil(Number(i.quantity)), rate: 1.5, request_item_ids: [i.request_item_id] })),
    });
    const noRate = await PUR("POST", "/purchase", { supplier: "X", expected_delivery_date: "2026-12-15", items: [{ component_id: comp.component_id, quantity: 1 }] });
    ok("A purchase without a rate is refused", noRate.status === 422);
    ok("Purchase places one order for the shortage", po.status === 201, `${po.data?.po_number}, ${toBuy.length} lines`);
    ok("Purchase marks it received", (await PUR("POST", `/purchase/${po.data.id}/receive`, {})).status === 200);
    ok("Purchase sends it to IQC", (await PUR("POST", `/purchase/${po.data.id}/send-to-iqc`, {})).status === 200);
    ok("Tracker: waiting for IQC", (await stage(o3))?.waitingFor === "IQC_MANAGER", (await stage(o3))?.stage);
    const lines = (await IQC("GET", `/iqc/${po.data.id}`)).data.items;
    const checked = await IQC("POST", `/iqc/${po.data.id}/inspect`, { items: lines.map((l, i) => ({ id: l.id, rejected: i === 0 ? 1 : 0, remarks: i === 0 ? "Bent leg" : "" })) });
    ok("IQC checks it (1 piece rejected)", checked.status < 300, `${checked.status} ${checked.data?.message || ""}`);
    ok("Tracker: waiting for Store", (await stage(o3))?.waitingFor === "STORE_MANAGER", (await stage(o3))?.stage);
    ok("Store accepts it into stock", (await STORE("POST", `/incoming-stock/${po.data.id}/accept`, {})).status === 200);
    if (!ONE_ROLE) ok("IQC cannot see customer orders (Order Tracker)", (await IQC("GET", "/order-tracker")).status === 403);
    if (!ONE_ROLE) ok("IQC still sees what Purchase sent", (await IQC("GET", "/purchase")).data.some((x) => x.id === po.data.id));
    const listed = (await PUR("GET", "/purchase")).data.find((x) => x.id === po.data.id);
    ok("Purchase list links each order it is for", listed?.order_refs?.some((r) => r.id === o3), JSON.stringify(listed?.order_refs));
    ok("Tracker: back with Production", (await stage(o3))?.waitingFor === "PRODUCTION_MANAGER", (await stage(o3))?.stage);

    /* ---- 7. The books still balance; the month report sees the sale ---- */
    const balance = (await SA("GET", "/inventory/history/balance")).data;
    ok("Inventory History: nothing unexplained", Number(balance.shortfall.unexplained) === 0, `in production ${balance.shortfall.in_production}, with reason ${balance.shortfall.explained_total}`);
    const month = new Date().toISOString().slice(0, 7);
    const report = (await SA("GET", `/reports/monthly?month=${month}`)).data;
    ok("Report counts the sale", report.sales.total > 0 && report.orderTime.delivered === 1, `₹${report.sales.total}`);
    ok("Report: net sales after the credit note, the cancelled bill not counted", report.sales.net === 885 && report.sales.bills === 1, `net ₹${report.sales.net}`);
    ok("Report: money received and nothing left to collect", report.sales.collected === 885 && report.sales.toCollect === 0, `received ₹${report.sales.collected}`);
    ok("Report: money spent on purchases", report.money.spent > 0, `₹${report.money.spent}`);
    ok("Report: profit worked out (standard costs where nothing was bought with a rate)", report.money.profit !== null && report.money.estimatedProducts > 0, `₹${report.money.profit}`);
    const [[anyItem]] = await db.query("SELECT id FROM inventory ORDER BY id LIMIT 1");
    ok("Super Admin sets a component's standard cost", (await SA("PUT", `/inventory/${anyItem.id}/cost`, { standard_cost: 1.25 })).status === 200);
    if (!ONE_ROLE) ok("Store cannot change a component's cost", (await STORE("PUT", `/inventory/${anyItem.id}/cost`, { standard_cost: 9 })).status === 403);
    ok("Report: QC passed first try", report.qualityCheck.firstTryPassPct === 100);

    /* ---- 8. The CEO's dashboard (Super Admin) gets every figure it shows ---- */
    const ceo = await Promise.all(["/order-tracker", `/reports/monthly?month=${month}`, "/inventory/history/balance", "/inventory?status=active",
      "/product-stock", "/extra-materials", `/attendance?date=${new Date().toISOString().slice(0, 10)}`].map((u) => SA("GET", u)));
    ok("CEO dashboard: every figure loads", ceo.every((x) => x.status === 200), ceo.map((x) => x.status).join(","));
    const tracked = ceo[0].data.find((o) => o.id === orderId);
    ok("CEO dashboard: promised date comes as a plain day", /^\d{4}-\d{2}-\d{2}$/.test(tracked?.promisedDate || ""), tracked?.promisedDate);

    /* ---- 9. The CEO hears about everything; the phone only rings for what matters ---- */
    const inbox = (await SA("GET", "/notifications")).data;
    const roles = new Set(inbox.items.map((x) => x.for_role));
    ok("Super Admin's bell has every department's notifications", ["MARKETING_MANAGER", "OPERATIONS_ADMIN", "STORE_MANAGER", "PRODUCTION_MANAGER", "PURCHASE_MANAGER"].every((r) => roles.has(r)), [...roles].length + " roles");
    ok("Each one says who sent it", inbox.items.some((x) => x.from_role && x.for_role !== x.from_role));
    const important = (await SA("GET", "/notifications?important=1")).data.items.map((x) => x.type);
    ok("Important: IQC rejection, extra material, discounted bill, cancels, credit note",
      ["IQC_RESULT", "EXTRA_MATERIAL_REQUESTED", "FINISHED_GOODS_BILLED", "ORDER_CANCELLED", "BILL_CANCELLED", "CREDIT_NOTE"].every((t) => important.includes(t)), [...new Set(important)].join(","));
    ok("Important leaves out the everyday hand-overs", !important.includes("MATERIAL_ISSUED") && !important.includes("FINISHED_GOODS_IN_STORE"));
    if (!ONE_ROLE) {
      const own = (await STORE("GET", "/notifications")).data.items;
      ok("Store still sees only its own inbox", own.length > 0 && own.every((x) => x.for_role === "STORE_MANAGER"));
      const storeNote = inbox.items.find((x) => x.for_role === "STORE_MANAGER");
      ok("Super Admin can mark another role's notification read", (await SA("POST", `/notifications/${storeNote.id}/read`)).status === 200);
      const [[task]] = await db.query("SELECT id FROM notifications WHERE role = 'STORE_MANAGER' ORDER BY id DESC LIMIT 1");
      await db.query("UPDATE notifications SET requires_action = 1 WHERE id = ?", [task.id]);
      ok("…but cannot close another role's task", (await SA("POST", `/notifications/${task.id}/done`)).status === 404);
    }
    // an order waiting 5 days: the hourly check tells the CEO once a day
    await db.query("UPDATE orders SET updated_at = DATE_SUB(NOW(), INTERVAL 5 DAY) WHERE id = ?", [o3]);
    const tracker = require("../modules/reports/order-tracker.service");
    const firstRun = await tracker.notifyStuckOrders();
    const secondRun = await tracker.notifyStuckOrders();
    const stuckNote = (await SA("GET", "/notifications?important=1")).data.items.find((x) => x.type === "ORDER_STUCK" && x.order_id === o3);
    ok("Stuck order (5 days) is told to the Super Admin", firstRun >= 1 && !!stuckNote, stuckNote?.title);
    ok("…only once a day", secondRun === 0);
  } finally {
    server.close();
    await db.end().catch(() => {});
  }
}

main()
  .catch((error) => { failures++; console.error("FAIL", error); })
  .finally(async () => {
    await dropCopy().catch((e) => console.error("could not drop the e2e database:", e.message));
    console.log(`${failures ? `\n${failures} step(s) failed` : "\nall steps passed"}${ONE_ROLE ? ` (every step as ${ONE_ROLE})` : ""}`);
    process.exit(failures ? 1 : 0);
  });

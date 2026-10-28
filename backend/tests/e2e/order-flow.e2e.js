/*
  npm run e2e   ->  one order through EVERY role, over the real HTTP API, on a throw-away copy of the database.
  (Run by Vitest with vitest.e2e.config.mjs. `npm test` does not pick this file up: it is slow and needs MySQL.)

  1. builds <DB_NAME>_e2e from schema.sql with its own basics: a user per role, 2 products with their BOMs, stock
     (tests/helpers/mysqlDb.js). The real database is never read or written, so this runs on an empty MySQL too.
  2. starts the API on a free port and, signed in as each role in turn, walks one order from Marketing to delivery
     (approve, then send to Production / to Purchase as separate steps), plus a cancelled order, a reduced quantity
     accepted and one declined, a purchase for a short component, and the checks that must refuse (wrong role ...)
  3. prints one line per step; every failed step is reported by Vitest with its name; the e2e database is dropped

  E2E_ONE_ROLE=SUPER_ADMIN npm run e2e  ->  the same walk with EVERY step done by that one role (the CEO doing each
  team's work); the "wrong role is refused" checks are skipped then.
*/
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const testDb = require("../helpers/mysqlDb").throwaway("e2e"); // first: everything required below talks to the copy
const jwt = require("jsonwebtoken");

const ONE_ROLE = process.env.E2E_ONE_ROLE || null;
// one line per step (as before), and a soft check: the walk goes on, Vitest lists every failed step at the end
const ok = (label, pass, extra = "") => {
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${extra ? `  (${extra})` : ""}`);
  expect.soft(!!pass, `${label}${extra ? `  (${extra})` : ""}`).toBe(true);
};

// "YYYY-MM-DD", n days from today (dates in the walk never go stale)
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let server = null;
let db = null;

describe(`one order through every role${ONE_ROLE ? ` (every step as ${ONE_ROLE})` : ""}`, () => {
  beforeAll(async () => {
    await testDb.create();
    await testDb.reset(); // the basics: a user per role, products with BOMs, stock
  }, 120_000);
  afterAll(async () => {
    server?.close();
    await testDb.drop(); // closes the app's pool too
  }, 60_000);

  it("Marketing to delivery, plus a cancel, a reduced quantity and a purchase", async () => {
    const env = require("../../src/config/env");
    db = require("../../src/config/db");
    const { createApp, API_VERSION_PREFIX } = require("../../src/app");
    const { cookieNameFor } = require("../../src/shared/session");
    server = createApp().listen(0);
    const base = `http://127.0.0.1:${server.address().port}${API_VERSION_PREFIX}`;
    {
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
      // every Marketing order is for a customer (a new name is saved by the server)
      const newOrder = (quantity) => MKT("POST", "/marketing-orders", { customer_name: "E2E Traders", items: [{ productId: product.id, quantity }], estimated_delivery_date: daysFromNow(60) });

      /*
        The Operations Admin's three separate steps: approve (the decision only), then send the short components to
        Purchase (once) and what the stock can build now to Production (stock deducted). Each list is sent only when
        it has something in it, the way the buttons are only offered then.
      */
      const approveAndSend = async (id) => {
        const before = (await OPS("GET", `/order-approvals/${id}/plan`)).data;
        const approved = await OPS("POST", `/order-approvals/${id}/approve`, { idempotency_key: key("approve"), expected_round: before.approval_round });
        const plan = (await OPS("GET", `/order-approvals/${id}/plan`)).data;
        const purchase = plan.shortages.length
          ? await OPS("POST", `/order-approvals/${id}/send-to-purchase`, { purchase_items: plan.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })) })
          : null;
        const make = plan.lines.filter((l) => l.can_make > 0);
        const production = make.length
          ? await OPS("POST", `/order-approvals/${id}/send-to-production`, {
              idempotency_key: key("production"),
              expected_round: plan.approval_round,
              production_items: make.map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
            })
          : null;
        return { approved, plan, purchase, production };
      };

      // a product with a complete BOM
      const [[product]] = await db.query(
        `SELECT p.id, p.name FROM products p JOIN product_bom b ON b.product_id = p.id
         WHERE p.is_active = 1 AND b.quantity_required > 0 GROUP BY p.id ORDER BY p.id LIMIT 1`
      );
      const UNITS = 4;
      ok("Super Admin sets the price list", (await SA("PUT", `/products/${product.id}/price`, { selling_price: 250 })).status === 200, "₹250, no GST");
      if (!ONE_ROLE) ok("Marketing cannot change the price list", (await MKT("PUT", `/products/${product.id}/price`, { selling_price: 1 })).status === 403);

      /* ---- 1. Marketing raises the order, Operations Admin approves it ---- */
      const noCustomer = await MKT("POST", "/marketing-orders", { items: [{ productId: product.id, quantity: UNITS }] });
      ok("An order without a customer is refused", noCustomer.status === 422, noCustomer.data?.code);
      const created = await newOrder(UNITS);
      const orderId = created.data?.id;
      ok("Marketing creates an order for a customer", created.status === 201 && orderId, `${product.name} x ${UNITS}`);
      ok("Marketing sends it to Operations Admin", (await MKT("POST", `/marketing-orders/${orderId}/send`)).status === 200);
      ok("Tracker: waiting for Operations Admin", (await stage(orderId))?.waitingFor === "OPERATIONS_ADMIN");

      if (!ONE_ROLE) ok("Marketing cannot approve", (await MKT("POST", `/order-approvals/${orderId}/approve`, {})).status === 403);
      const [[shelfBefore]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
      const approval = await approveAndSend(orderId);
      const [[shelfAfter]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
      ok("Operations Admin approves", approval.approved.status === 200 && approval.approved.data?.approval_status === "APPROVED");
      ok("Then sends it to Production (stock taken from the shelf)", approval.production?.status === 200 && Number(shelfAfter.s) < Number(shelfBefore.s), `can make ${approval.plan.lines[0]?.can_make}`);

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
      // the Store may hand over part now and the rest later (material for 1 unit, then for the other 3)
      const partial = await STORE("POST", `/material-requests/${request.id}/issue`, { items: allOf(1), product_quantity: 1, idempotency_key: key("iss") });
      ok("Store hands over part of the request", partial.status === 200, partial.data?.code);
      const rest = await STORE("POST", `/material-requests/${request.id}/issue`, { items: allOf(UNITS - 1), product_quantity: UNITS - 1, idempotency_key: key("iss") });
      ok("…and the rest later", rest.status === 200, rest.data?.code);

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
      ok("QC passes the batch without a sample count (the Saturday QC screen sends only the decision)", (await QC("POST", `/quality-control/${run.id}/decision`, { decision: "PASS" })).status === 201);

      /* ---- 5. After QC: one owner per step ---- */
      const fg = (await MKT("GET", "/finished-goods")).data.find((f) => f.orderId === orderId);
      ok("QC pass sends the packed order straight to the Store", fg?.status === "HANDED_OVER");
      ok("Tracker: waiting for Store", (await stage(orderId))?.waitingFor === "STORE_MANAGER", (await stage(orderId))?.stage);
      if (!ONE_ROLE) ok("Marketing cannot receive into Store", (await MKT("POST", `/finished-goods/${fg.id}/receive`)).status === 403);
      const before = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand ?? 0;
      ok("Store receives into product stock", (await STORE("POST", `/finished-goods/${fg.id}/receive`)).status === 200);
      const after = (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand;
      ok("Product stock went up by the order", after - before === UNITS, `${before} -> ${after}`);
      // the bill is made out to the order's own customer (saved when Marketing raised the order)
      const customer = (await MKT("GET", "/customers")).data.find((c) => c.name === "E2E Traders");
      ok("The order's customer is saved", !!customer?.id);
      const billBody = (rate, note) => ({ items: [{ product_id: product.id, rate, note }] });
      const noReason = await MKT("POST", `/finished-goods/${fg.id}/bill`, billBody(200));
      ok("A rate below the price list needs a reason", noReason.status === 422, noReason.data?.code);
      const first = await MKT("POST", `/finished-goods/${fg.id}/bill`, billBody(200, "Old customer, bulk order"));
      ok("Marketing bills with a discount and its reason", first.status === 201, first.data?.billNumber);
      if (!ONE_ROLE) ok("Marketing cannot cancel a bill", (await MKT("POST", `/finished-goods/${fg.id}/bill/cancel`, { reason: "try" })).status === 403);
      ok("Super Admin cancels the bill (goods still in Store)", (await SA("POST", `/finished-goods/${fg.id}/bill/cancel`, { reason: "Wrong rate on the bill" })).status === 201);
      const bill = await MKT("POST", `/finished-goods/${fg.id}/bill`, {}); // nothing to fill in
      ok("Marketing makes the bill again in one click: the order's customer, the price list", bill.status === 201, `${bill.data?.billNumber}: 4 x 250 = 1000, no GST`);
      const made = (await MKT("GET", `/finished-goods/${fg.id}/bill`)).data;
      ok("The bill is for the order's customer, at 1000", made.customerName === "E2E Traders" && made.total === 1000, `${made.customerName} ₹${made.total}`);
      const unpaid = await STORE("POST", `/finished-goods/${fg.id}/dispatch`, { note: "e2e truck" });
      ok("Store cannot give out an unpaid order", unpaid.status === 409 && unpaid.data?.code === "PAYMENT_DUE", unpaid.data?.code);
      const part = await MKT("POST", `/finished-goods/${fg.id}/payments`, { amount: 500, method: "UPI" });
      ok("A part payment is refused: the bill is paid in full, in one go", part.status === 422 && part.data?.code === "PAY_IN_FULL", part.data?.code);
      ok("Marketing records the payment: only how it was paid", (await MKT("POST", `/finished-goods/${fg.id}/payments`, { method: "UPI", reference: "UTR123" })).status === 201);
      const twice = await MKT("POST", `/finished-goods/${fg.id}/payments`, { method: "CASH" });
      ok("A second payment is refused", twice.status === 409 && twice.data?.code === "ALREADY_PAID", twice.data?.code);
      ok("Store gives out for delivery once fully paid", (await STORE("POST", `/finished-goods/${fg.id}/dispatch`, { note: "e2e truck" })).status === 200);
      const moves = (await STORE("GET", "/product-stock/movements")).data;
      ok("Product stock history links the order", moves.length > 0 && moves.every((m) => m.orderId === orderId), `${moves.length} moves`);
      ok("Product stock went back down", (await STORE("GET", "/product-stock")).data.find((p) => p.productId === product.id)?.onHand === before);
      const done = (await MKT("GET", `/finished-goods/${fg.id}`)).data;
      ok("Giving out completes the order", done.status === "DELIVERED" && (await stage(orderId))?.waitingFor === null, (await stage(orderId))?.stage);
      const mine = (await MKT("GET", "/marketing-orders")).data.find((o) => o.id === orderId);
      ok("Marketing sees every unit given to the customer", mine?.delivered_units === UNITS, `${mine?.delivered_units} of ${UNITS}`);
      ok("Super Admin makes a credit note (1 piece returned)", (await SA("POST", `/finished-goods/${fg.id}/credit-note`, { amount: 250, reason: "1 piece returned damaged" })).status === 201);
      const paidBill = (await MKT("GET", `/finished-goods/${fg.id}/bill`)).data;
      ok("Bill: 1000 paid, 250 credit = 250 to give back", paidBill.due === 0 && paidBill.refund === 250 && paidBill.paymentStatus === "PAID", `refund ${paidBill.refund}`);

      /* ---- Sales & Billing (Marketing) ---- */
      const billsList = (await MKT("GET", "/sales/bills")).data;
      const active = billsList.find((b) => b.finishedGoodsId === fg.id && b.status === "ACTIVE");
      const cancelledBill = billsList.find((b) => b.finishedGoodsId === fg.id && b.status === "CANCELLED");
      ok("Bills list: the bill, paid in full after the credit note", active?.paymentStatus === "PAID" && active.net === 750 && active.due === 0, `${active?.billNumber} net ${active?.net}`);
      ok("Bills list keeps the cancelled bill with its reason", cancelledBill?.paymentStatus === "CANCELLED" && !!cancelledBill.cancelReason);
      const sales = (await MKT("GET", "/sales/summary")).data;
      ok("Marketing sees this month's sales and money in", sales.net === 750 && sales.collected === 1000 && sales.toCollect === 0);
      const paid = (await MKT("GET", "/sales/payments")).data;
      ok("Received this month: the one payment behind it, adding up to the figure", paid.length === 1 && paid.reduce((s, p) => s + p.amount, 0) === sales.collected && paid.every((p) => p.billNumber), `${paid.length} payments`);
      const customerRow = (await MKT("GET", "/customers")).data.find((c) => c.id === customer.id);
      ok("Customer shows what it bought and owes", customerRow?.bought === 750 && customerRow.due === 0 && customerRow.bills === 1, `bought ${customerRow?.bought}`);
      ok("Marketing edits the customer", (await MKT("PUT", `/customers/${customer.id}`, { name: customer.name, phone: "9876543210", gstin: "27ABCDE1234F1Z5" })).status === 200);
      if (!ONE_ROLE) ok("Store cannot open Sales & Billing", (await STORE("GET", "/sales/bills")).status === 403);
      if (!ONE_ROLE) ok("Operations Admin can look at the bills", (await OPS("GET", "/sales/bills")).status === 200);
      ok("Tracker: delivered, waiting for nobody", (await stage(orderId))?.done === true);
      const journey = (await SA("GET", `/order-tracker/${orderId}`)).data;
      ok("Journey lists every step", journey?.events?.length >= 15, `${journey?.events?.length} events`);

      /* ---- 6. An approved order can be cancelled only while it was not sent on ---- */
      const o2 = (await newOrder(2)).data.id;
      await MKT("POST", `/marketing-orders/${o2}/send`);
      const plan2 = (await OPS("GET", `/order-approvals/${o2}/plan`)).data;
      await OPS("POST", `/order-approvals/${o2}/approve`, { idempotency_key: key("approve"), expected_round: plan2.approval_round });
      const [[stock1]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
      if (!ONE_ROLE) ok("Marketing cannot cancel", (await MKT("POST", `/order-approvals/${o2}/cancel`, { remarks: "nope" })).status === 403);
      const cancel = await OPS("POST", `/order-approvals/${o2}/cancel`, { remarks: "Customer cancelled on the phone" });
      const [[stock2]] = await db.query("SELECT SUM(quantity_on_hand) AS s FROM inventory");
      ok("Operations Admin cancels an approved order not sent on yet", cancel.status === 200 && cancel.data?.approval_status === "CANCELLED", cancel.data?.code);
      ok("No stock moved (nothing had left the shelf)", Number(stock2.s) === Number(stock1.s));
      const o2b = (await newOrder(2)).data.id;
      await MKT("POST", `/marketing-orders/${o2b}/send`);
      await approveAndSend(o2b);
      const late = await OPS("POST", `/order-approvals/${o2b}/cancel`, { remarks: "Customer cancelled on the phone" });
      ok("Once sent to Production it can no longer be cancelled", late.status === 409 && late.data?.code === "ALREADY_SENT_ON", late.data?.code);

      /* ---- 6a. The Operations Admin promises less: the rest is dropped, no draft is made in Marketing's name ---- */
      const o4 = (await newOrder(10)).data.id;
      await MKT("POST", `/marketing-orders/${o4}/send`);
      const revised = await OPS("POST", `/order-approvals/${o4}/revise`, { remarks: "Only 6 this month", items: [{ product_id: product.id, quantity: 6 }] });
      ok("Operations Admin promises 6 of the 10", revised.status === 200 && revised.data?.approval_status === "QUANTITY_REVISED", revised.data?.code);
      const drafts = (await MKT("GET", "/marketing-orders")).data.filter((o) => o.approval_status === "DRAFT");
      ok("The 4 not made do not become a draft in Marketing's name", drafts.length === 0, `${drafts.length} drafts`);
      const accepted = await MKT("POST", `/marketing-orders/${o4}/accept-revision`);
      ok("Marketing accepts the 6: back with the Operations Admin", accepted.data?.approval_status === "PENDING_APPROVAL" && accepted.data?.totals?.quantity === 6, `${accepted.data?.totals?.quantity} units`);
      const o5 = (await newOrder(10)).data.id;
      await MKT("POST", `/marketing-orders/${o5}/send`);
      await OPS("POST", `/order-approvals/${o5}/revise`, { remarks: "Only 6 this month", items: [{ product_id: product.id, quantity: 6 }] });
      const declined = await MKT("POST", `/marketing-orders/${o5}/decline-revision`);
      ok("Marketing declines a reduced quantity: the order is cancelled", declined.data?.approval_status === "CANCELLED", declined.data?.approval_status);

      /* ---- 6b. A component runs out: Purchase buys it, IQC checks it, Store accepts it ---- */
      const PUR = as("PURCHASE_MANAGER"), IQC = as("IQC_MANAGER");
      const [[inv]] = await db.query("SELECT id, quantity_on_hand FROM inventory WHERE component_id = ?", [comp.component_id]);
      const emptied = await SA("POST", `/inventory/${inv.id}/stock-out`, {
        quantity: Number(inv.quantity_on_hand), reason: "e2e: sent back so the next order is short", reason_code: "RETURNED_TO_SUPPLIER", idempotency_key: key("out"),
      });
      ok("Super Admin corrects stock by hand, with a reason", emptied.status < 300, `${emptied.status} ${emptied.data?.message || ""}`);
      const o3 = (await newOrder(2)).data.id;
      await MKT("POST", `/marketing-orders/${o3}/send`);
      const plan3 = (await OPS("GET", `/order-approvals/${o3}/plan`)).data;
      ok("Approval plan shows the short component", plan3.shortages.some((x) => x.component_id === comp.component_id), `${plan3.shortages.length} short`);
      const third = await approveAndSend(o3);
      ok("Operations Admin sends the short components to Purchase", third.purchase?.status === 200, `${plan3.shortages.length} components`);
      const again = await OPS("POST", `/order-approvals/${o3}/send-to-purchase`, { purchase_items: plan3.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })) });
      ok("…only once per order", again.status === 409, again.data?.code);
      ok("Tracker: waiting for Purchase", (await stage(o3))?.waitingFor === "PURCHASE_MANAGER", (await stage(o3))?.stage);
      const approved = (await PUR("GET", "/approved-orders")).data.find((o) => o.id === o3);
      const toBuy = approved?.purchase_request?.items ?? [];
      const po = await PUR("POST", "/purchase", {
        supplier: "E2E Components", expected_delivery_date: daysFromNow(30),
        items: toBuy.map((i) => ({ component_id: i.component_id, quantity: Math.ceil(Number(i.quantity)), rate: 1.5, request_item_ids: [i.request_item_id] })),
      });
      const noRate = await PUR("POST", "/purchase", { supplier: "X", expected_delivery_date: daysFromNow(30), items: [{ component_id: comp.component_id, quantity: 1 }] });
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
      ok("Report: net sales after the credit note, the cancelled bill not counted", report.sales.net === 750 && report.sales.bills === 1, `net ₹${report.sales.net}`);
      ok("Report: money received (the 1000 in one payment) and nothing left to collect", report.sales.collected === 1000 && report.sales.toCollect === 0, `received ₹${report.sales.collected}`);
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
      const tracker = require("../../src/modules/reports/order-tracker.service");
      const firstRun = await tracker.notifyStuckOrders();
      const secondRun = await tracker.notifyStuckOrders();
      const stuckNote = (await SA("GET", "/notifications?important=1")).data.items.find((x) => x.type === "ORDER_STUCK" && x.order_id === o3);
      ok("Stuck order (5 days) is told to the Super Admin", firstRun >= 1 && !!stuckNote, stuckNote?.title);
      ok("…only once a day", secondRun === 0);
      }
  }, 600_000);
});

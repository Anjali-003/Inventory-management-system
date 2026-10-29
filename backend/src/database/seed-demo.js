/*
    npm run seed:demo   ->  builds ready-made checkpoints for manual testing (backend/snapshots/*.json)

    Each checkpoint is a stage of the order flow, with SEVERAL orders waiting there, one per test case. Load the stage
    you want to test, try something, load it again to start over:

        npm run db:load 2-sent-to-ops      then, as the Operations Admin, approve / revise / reject the orders there

    How it is built (your own database is never touched):
      1. a copy, <DB_NAME>_demo, gets your users (so the same logins work), products, components, BOMs and
         employees, plus 5,000 of every component in stock
      2. the backend runs on that copy and every step is done over the real API, as the role whose job it is
      3. after each stage the copy is saved as a checkpoint, then the copy is dropped

    The orders (customers and products are yours; P1 = first product, P2 = second):
      A  P1 x 10, due in 30 days ......... the easy path: approve, Production, Store, QC, Store, bill (payment: yours to test)
      B  P1, 30 more than the stock can make  approved with a shortage: list to Purchase, the rest to Production
      C  P2 x 1000 ....................... Operations promises less (revise), Marketing accepts
      D  P2 x 1000 ....................... Operations promises less, Marketing declines (cancelled)
      E  P2 x 5 .......................... rejected by Operations
      F  P2 x 5, due in 3 days ........... approved, not sent on: "Due for delivery: this week"
      G  P2 x 5 .......................... approved, delivery date moved 3 days into the past: "Late by 3 days"
      H  P1 x 2 + P2 x 2 ................. two products in one order
      I  P1 x 3 .......................... left as a draft (Marketing: send / delete)
      J  P1 x 20 ......................... also short (B took the stock): with B, ONE combined purchase order for both

    9-sales-history (Marketing's money): orders taken all the way through, then moved back in time, so the dashboard
    has bills of every age, last month's sales to compare with, and top customers:
      K  Mehta Distributors   billed 100 days ago, not paid ............ "Over 90 days" (red)
      L  Kapoor Enterprises   billed 75 days ago, not paid ............. "61-90 days"
      M  Singh Agencies       billed 45 days ago, not paid ............. "31-60 days"
      N  Verma & Sons         billed 10 days ago, not paid ............. "0-30 days"
      O  Gupta Traders        last month: billed, paid, delivered
      P  Sharma Electronics   last month: billed, paid, delivered
      Q  Mehta Distributors   billed last month, paid this month ....... in "Received" this month, not in "Billed"
      R  Sharma Electronics   this month, two products: billed, paid, delivered (the top customer)
      S  Kapoor Enterprises   this month: billed below the price list (discount with a reason), paid, delivered,
                              then a credit note for a damaged piece
      T  Singh Agencies       billed, then the bill cancelled (wrong details): in the Store to bill again
      U  Verma & Sons         in the Store, not billed yet ............. "Your turn: to bill"; its rate was agreed on the
                              order 5% under the price list ("Annual contract"), so the bill starts from that rate
      Joshi Electricals       ordered 120, 90 and 60 days ago (every 30 days), nothing since . "Going quiet"
*/
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const LIVE = process.env.DB_NAME;
const DEMO = `${LIVE}_demo`;
process.env.DB_NAME = DEMO; // everything required below works on the copy

const fs = require("fs");
const jwt = require("jsonwebtoken");
const { connect } = require("./lib/connection");

const STOCK = 5000;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const key = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function buildCopy() {
    const admin = await connect({ withDatabase: false, multipleStatements: true });
    try {
        const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
            .replace(/^\s*CREATE\s+DATABASE\b[^;]*;/gim, "")
            .replace(/^\s*USE\s+[^;]*;/gim, "");
        await admin.query(`DROP DATABASE IF EXISTS \`${DEMO}\`; CREATE DATABASE \`${DEMO}\`; USE \`${DEMO}\`;`);
        await admin.query(schema);
        for (const t of ["users", "employees", "products", "components", "product_bom"]) {
            await admin.query(`INSERT INTO \`${DEMO}\`.\`${t}\` SELECT * FROM \`${LIVE}\`.\`${t}\``);
        }
        await admin.query(`INSERT INTO \`${DEMO}\`.inventory (component_id, quantity_on_hand, quantity_reserved) SELECT id, ${STOCK}, 0 FROM \`${DEMO}\`.components`);
        await admin.query(
            `INSERT INTO \`${DEMO}\`.inventory_transactions (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
             SELECT id, 'STOCK_IN', 'IN', ${STOCK}, ${STOCK}, 'Opening stock (demo)', NULL FROM \`${DEMO}\`.components`
        );
    } finally {
        await admin.end();
    }
}

async function dropCopy() {
    const admin = await connect({ withDatabase: false });
    await admin.query(`DROP DATABASE IF EXISTS \`${DEMO}\``);
    await admin.end();
}

/* saves the copy as a checkpoint, with the same script as npm run db:save */
function checkpoint(name, what) {
    const res = spawnSync(process.execPath, [path.join(__dirname, "snapshot.js"), "save", name], { env: { ...process.env, DB_NAME: DEMO }, encoding: "utf8" });
    if (res.status !== 0) throw new Error(`could not save ${name}: ${res.stderr || res.stdout}`);
    console.log(`  saved ${name.padEnd(22)} ${what}`);
}

async function main() {
    console.log(`Building the demo on a copy (${DEMO}); ${LIVE} is not touched.`);
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
            if (!u) throw new Error(`no active ${role} user in ${LIVE}: create one first (npm run create-user)`);
            const token = jwt.sign({ userId: u.id, email: u.email, role }, env.jwt.secret, { expiresIn: "30m" });
            const res = await fetch(base + url, {
                method,
                headers: { "content-type": "application/json", "x-login-role": role, cookie: `${cookieNameFor(role)}=${token}` },
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => null);
            if (res.status >= 300) throw new Error(`${role} ${method} ${url} -> ${res.status} ${data?.message || ""}`);
            return data;
        };
        const MKT = as("MARKETING_MANAGER"), OPS = as("OPERATIONS_ADMIN"), PUR = as("PURCHASE_MANAGER"), IQC = as("IQC_MANAGER"),
            STORE = as("STORE_MANAGER"), PROD = as("PRODUCTION_MANAGER"), QC = as("QUALITY_FG_MANAGER"), SA = as("SUPER_ADMIN");

        // the two products with a complete BOM, and how many of each the opening stock can make
        const [products] = await db.query(
            `SELECT p.id, p.name, p.selling_price, MIN(FLOOR(${STOCK} / b.quantity_required)) AS can_make
             FROM products p JOIN product_bom b ON b.product_id = p.id
             WHERE p.is_active = 1 GROUP BY p.id HAVING MIN(b.quantity_required) > 0 ORDER BY p.id LIMIT 2`
        );
        if (products.length < 2) throw new Error(`${LIVE} needs 2 active products with a complete BOM (npm run seed)`);
        const [P1, P2] = products;
        for (const p of products) if (p.selling_price === null) await SA("PUT", `/products/${p.id}/price`, { selling_price: 1000 });

        checkpoint("1-fresh", "products, stock and logins, no orders");

        /* ---- 2. Marketing raises the orders and sends them ---- */
        const lines = (...pairs) => pairs.map(([p, quantity]) => ({ productId: p.id, quantity }));
        const raise = async (customer, items, due, send = true) => {
            const o = await MKT("POST", "/marketing-orders", { customer_name: customer, items, required_by_date: due });
            if (send) await MKT("POST", `/marketing-orders/${o.id}/send`);
            return o;
        };
        const A = await raise("Sharma Electronics", lines([P1, 10]), day(30));
        const B = await raise("Gupta Traders", lines([P1, Number(P1.can_make) - 12 + 30]), day(20)); // A and H take 12 first
        const C = await raise("Verma & Sons", lines([P2, 1000]), day(25));
        const D = await raise("Gupta Traders", lines([P2, 1000]), day(25));
        const E = await raise("Sharma Electronics", lines([P2, 5]), day(15));
        const F = await raise("Verma & Sons", lines([P2, 5]), day(3));
        const G = await raise("Sharma Electronics", lines([P2, 5]), day(10));
        const H = await raise("Gupta Traders", lines([P1, 2], [P2, 2]), day(40));
        const I = await raise("Verma & Sons", lines([P1, 3]), day(35), false);
        const J = await raise("Sharma Electronics", lines([P1, 20]), day(28));
        checkpoint("2-sent-to-ops", "A-H and J waiting for the Operations Admin, I a draft");

        /* ---- 2b. Operations promises less on C and D ---- */
        const cUnits = Math.min(800, Math.floor(Number(P2.can_make) / 2));
        await OPS("POST", `/order-approvals/${C.id}/revise`, { remarks: "We can make this much in time", items: [{ product_id: P2.id, quantity: cUnits }] });
        await OPS("POST", `/order-approvals/${D.id}/revise`, { remarks: "Line busy this month", items: [{ product_id: P2.id, quantity: 600 }] });
        checkpoint("2b-revised", "C and D wait for Marketing to accept or decline");

        /* ---- 3. Marketing answers, Operations decides ---- */
        await MKT("POST", `/marketing-orders/${C.id}/accept-revision`);
        await MKT("POST", `/marketing-orders/${D.id}/decline-revision`);
        await OPS("POST", `/order-approvals/${E.id}/reject`, { remarks: "Product being redesigned, order again next month" });
        const approve = async (o) => {
            const plan = await OPS("GET", `/order-approvals/${o.id}/plan`);
            await OPS("POST", `/order-approvals/${o.id}/approve`, { idempotency_key: key("ap"), expected_round: plan.approval_round });
        };
        for (const o of [A, B, C, F, G, H, J]) await approve(o);
        await OPS("PATCH", `/order-approvals/${G.id}/delivery-date`, { estimated_delivery_date: day(-3), reason: "Customer asked for it earlier" });
        checkpoint("3-approved", "A B C F G H J approved, nothing sent on yet; D declined, E rejected");

        /* ---- 4. Operations sends to Production and Purchase ---- */
        const toProduction = async (o) => {
            const plan = await OPS("GET", `/order-approvals/${o.id}/plan`);
            const make = plan.lines.filter((l) => l.can_make > 0);
            if (!make.length) return plan;
            await OPS("POST", `/order-approvals/${o.id}/send-to-production`, {
                idempotency_key: key("pr"), expected_round: plan.approval_round,
                production_items: make.map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
            });
            return plan;
        };
        for (const o of [A, H, C]) await toProduction(o);
        await toProduction(B); // B takes what is left on the shelf, so J (same product) is short of everything
        for (const o of [B, J]) {
            const plan = await OPS("GET", `/order-approvals/${o.id}/plan`);
            await OPS("POST", `/order-approvals/${o.id}/send-to-purchase`, { purchase_items: plan.shortages.map((x) => ({ component_id: x.component_id, quantity: x.shortage })) });
        }
        checkpoint("4-sent-on", "A C H B with Production (B partly); B's and J's short parts with Purchase (one combined order); F G still approved");

        /* ---- 5. Production asks for material, the Store hands it over; Purchase orders B's parts ---- */
        const [orderLines] = await db.query("SELECT id, order_id, product_id, quantity FROM order_items WHERE order_id IN (?) ORDER BY id", [[A.id, H.id, C.id]]);
        const handOver = async (line, units) => {
            const options = await PROD("GET", `/material-requests/options/${line.id}`);
            await PROD("POST", "/material-requests", {
                order_item_id: line.id, product_quantity: units, request_key: key("rq"),
                items: options.items.map((i) => ({ component_id: i.component_id, quantity: Number((i.quantity_per_product * units).toFixed(2)) })),
            });
            const request = (await STORE("GET", "/material-requests")).find((r) => r.order_item_id === line.id && r.status !== "ISSUED");
            await STORE("POST", `/material-requests/${request.id}/issue`, {
                items: request.items.map((i) => ({ request_item_id: i.id, quantity: Number((Number(i.quantity_per_product) * units).toFixed(2)) })),
                product_quantity: units, idempotency_key: key("is"),
            });
        };
        for (const line of orderLines) {
            if (line.order_id === C.id) await handOver(line, Math.max(1, Math.floor(Number(line.quantity) / 2))); // half for now
            else await handOver(line, Number(line.quantity));
        }
        // ONE purchase order for B and J: per component, both orders' lines in one quantity
        const toBuy = new Map();
        for (const o of (await PUR("GET", "/approved-orders")).filter((x) => x.id === B.id || x.id === J.id)) {
            for (const i of o.purchase_request?.items ?? []) {
                const c = toBuy.get(i.component_id) || { component_id: i.component_id, quantity: 0, request_item_ids: [] };
                c.quantity += Number(i.quantity);
                c.request_item_ids.push(i.request_item_id);
                toBuy.set(i.component_id, c);
            }
        }
        const po = await PUR("POST", "/purchase", {
            supplier: "Shree Components", expected_delivery_date: day(7),
            items: [...toBuy.values()].map((c) => ({ ...c, quantity: Math.ceil(c.quantity), rate: 2.5 })),
        });
        checkpoint("5-material-given", "material handed over for A and H (C half); one purchase order placed for B and J");

        /* ---- 6. Production builds; B's parts arrive and go to IQC ---- */
        for (const line of orderLines) {
            const units = line.order_id === C.id ? Math.max(1, Math.floor(Number(line.quantity) / 2)) : Number(line.quantity);
            await PROD("POST", `/orders/${line.id}/start-production`, { quantity: units });
        }
        for (const line of orderLines) {
            const run = (await PROD("GET", "/production")).find((r) => r.order_item_id === line.id);
            const done = line.order_id === C.id ? 1 : Number(line.quantity); // C: only 1 built so far
            await PROD("POST", `/production/${run.id}/update-progress`, { quantity: done });
        }
        await PUR("POST", `/purchase/${po.id}/receive`, {});
        await PUR("POST", `/purchase/${po.id}/send-to-iqc`, {});
        checkpoint("6-at-qc", "A and H built, waiting for QC; C partly built; B's and J's parts at IQC");

        /* ---- 7. QC passes A and H; the Store takes A in; IQC passes B's parts ---- */
        for (const line of orderLines.filter((l) => l.order_id !== C.id)) {
            const run = (await QC("GET", "/production")).find((r) => r.order_item_id === line.id);
            // the sample can never be bigger than the batch
            await QC("POST", `/quality-control/${run.id}/decision`, { decision: "PASS", sample_size: Math.min(3, Number(line.quantity)), sample_failed: 0 });
        }
        const fgA = (await STORE("GET", "/finished-goods")).filter((f) => f.orderId === A.id);
        for (const f of fgA) await STORE("POST", `/finished-goods/${f.id}/receive`);
        const iqcLines = (await IQC("GET", `/iqc/${po.id}`)).items;
        await IQC("POST", `/iqc/${po.id}/inspect`, { items: iqcLines.map((l) => ({ id: l.id, rejected: 0, remarks: "" })) });
        checkpoint("7-in-store", "A in the Store to bill; H passed QC, Store to receive; B's and J's parts for the Store to accept");

        /* ---- 8. Marketing bills A (one click: the order's customer, the price list); not paid yet ---- */
        for (const f of fgA) await MKT("POST", `/finished-goods/${f.id}/bill`, {});
        checkpoint("8-billed", "A billed, not paid yet: the Store cannot give it out until it is paid in full");

        /* ---- 9. Sales history for Marketing: orders taken to the Store, billed / paid / delivered, then moved back in time ---- */
        // the orders above used most of the stock: a second delivery of every component
        await db.query(`UPDATE inventory SET quantity_on_hand = quantity_on_hand + ${STOCK}`);
        await db.query(
            `INSERT INTO inventory_transactions (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
             SELECT component_id, 'STOCK_IN', 'IN', ${STOCK}, quantity_on_hand, 'Second delivery (demo)', NULL FROM inventory`
        );

        // approved, built, passed by QC and taken into the Store: the order's finished goods, ready to bill
        const toStore = async (o) => {
            await approve(o);
            await toProduction(o);
            const [its] = await db.query("SELECT id, quantity FROM order_items WHERE order_id = ? ORDER BY id", [o.id]);
            for (const line of its) {
                const units = Number(line.quantity);
                await handOver(line, units);
                await PROD("POST", `/orders/${line.id}/start-production`, { quantity: units });
                const run = (await PROD("GET", "/production")).find((r) => r.order_item_id === line.id);
                await PROD("POST", `/production/${run.id}/update-progress`, { quantity: units });
                await QC("POST", `/quality-control/${run.id}/decision`, { decision: "PASS", sample_size: Math.min(3, units), sample_failed: 0 });
            }
            const fg = (await STORE("GET", "/finished-goods")).filter((f) => f.orderId === o.id);
            for (const f of fg) await STORE("POST", `/finished-goods/${f.id}/receive`);
            return fg;
        };
        const bill = (f, body = {}) => MKT("POST", `/finished-goods/${f.id}/bill`, body);
        const pay = (f, method, reference) => MKT("POST", `/finished-goods/${f.id}/payments`, { method, reference });
        const giveOut = (f) => STORE("POST", `/finished-goods/${f.id}/dispatch`, { note: "Delivered by our van" });

        // the tables whose rows belong to an order (or to its bill), with their date columns. The component ledger is
        // append-only (a trigger refuses UPDATE) and keeps its real dates.
        const [dated] = await db.query(
            `SELECT c.TABLE_NAME AS t, c.COLUMN_NAME AS by_col, GROUP_CONCAT(d.COLUMN_NAME) AS cols
             FROM information_schema.COLUMNS c
             JOIN information_schema.COLUMNS d ON d.TABLE_SCHEMA = c.TABLE_SCHEMA AND d.TABLE_NAME = c.TABLE_NAME
                  AND d.DATA_TYPE IN ('date', 'datetime', 'timestamp') AND d.EXTRA NOT LIKE '%VIRTUAL GENERATED%' AND d.EXTRA NOT LIKE '%STORED GENERATED%'
             WHERE c.TABLE_SCHEMA = DATABASE() AND c.COLUMN_NAME IN ('order_id', 'bill_id') AND c.TABLE_NAME <> 'inventory_transactions'
             GROUP BY c.TABLE_NAME, c.COLUMN_NAME`
        );
        // every date of the order (and of its bills, payments, events, notifications) `days` earlier; the order number
        // carries the day it was made, so it is made again (and in the notifications that name it)
        const moveBack = async (o, days) => {
            const shift = (cols) => cols.split(",").map((c) => `\`${c}\` = \`${c}\` - INTERVAL ${days} DAY`).join(", ");
            const [[{ cols }]] = await db.query(
                `SELECT GROUP_CONCAT(COLUMN_NAME) AS cols FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND DATA_TYPE IN ('date', 'datetime', 'timestamp')`
            );
            await db.query(`UPDATE orders SET ${shift(cols)} WHERE id = ?`, [o.id]);
            for (const { t, by_col, cols: c } of dated) {
                if (by_col === "order_id") await db.query(`UPDATE \`${t}\` SET ${shift(c)} WHERE order_id = ?`, [o.id]);
                else await db.query(`UPDATE \`${t}\` SET ${shift(c)} WHERE bill_id IN (SELECT id FROM bills WHERE order_id = ?)`, [o.id]);
            }
            const [[row]] = await db.query("SELECT order_number, DATE_FORMAT(created_at, '%Y%m%d-%H') AS stamp FROM orders WHERE id = ?", [o.id]);
            const number = `ORD-${row.stamp}-${String(o.id).padStart(3, "0")}`;
            await db.query("UPDATE orders SET order_number = ? WHERE id = ?", [number, o.id]);
            await db.query(
                `UPDATE notifications SET title = REPLACE(title, ?, ?), body = REPLACE(body, ?, ?),
                        payload = CAST(REPLACE(CAST(payload AS CHAR), ?, ?) AS JSON) WHERE order_id = ?`,
                [row.order_number, number, row.order_number, number, row.order_number, number, o.id]
            );
        };
        // the money came in `days` ago (after the bill was made)
        const paidAgo = (o, days) => db.query(
            `UPDATE bill_payments SET paid_on = CURRENT_DATE - INTERVAL ${days} DAY, created_at = NOW() - INTERVAL ${days} DAY
             WHERE bill_id IN (SELECT id FROM bills WHERE order_id = ?)`,
            [o.id]
        );
        // days back to the middle of last month, however far into this month today is
        const lastMonth = new Date().getDate() + 12;

        // oldest first, so the bill numbers go up with the dates
        const K = await raise("Mehta Distributors", lines([P2, 4]), day(10));
        for (const f of await toStore(K)) await bill(f);
        await moveBack(K, 100);

        const L = await raise("Kapoor Enterprises", lines([P1, 3]), day(10));
        for (const f of await toStore(L)) await bill(f);
        await moveBack(L, 75);

        const M = await raise("Singh Agencies", lines([P2, 6]), day(10));
        for (const f of await toStore(M)) await bill(f);
        await moveBack(M, 45);

        const O = await raise("Gupta Traders", lines([P1, 5]), day(10));
        for (const f of await toStore(O)) { await bill(f); await pay(f, "BANK", "NEFT 448210"); await giveOut(f); }
        await moveBack(O, lastMonth + 2);
        await paidAgo(O, lastMonth);

        const P = await raise("Sharma Electronics", lines([P2, 8]), day(10));
        for (const f of await toStore(P)) { await bill(f); await pay(f, "UPI", "UPI 7781"); await giveOut(f); }
        await moveBack(P, lastMonth);
        await paidAgo(P, lastMonth - 3);

        const Q = await raise("Mehta Distributors", lines([P2, 3]), day(10));
        for (const f of await toStore(Q)) { await bill(f); await pay(f, "CHEQUE", "Cheque 004512"); await giveOut(f); }
        await moveBack(Q, lastMonth - 5);
        await paidAgo(Q, new Date().getDate() - 1); // the 1st of this month

        const N = await raise("Verma & Sons", lines([P2, 2]), day(10));
        for (const f of await toStore(N)) await bill(f);
        await moveBack(N, 10);

        const R = await raise("Sharma Electronics", lines([P2, 10], [P1, 2]), day(10));
        for (const f of await toStore(R)) { await bill(f); await pay(f, "BANK", "RTGS 99120"); await giveOut(f); }

        const S = await raise("Kapoor Enterprises", lines([P1, 4]), day(10));
        for (const f of await toStore(S)) {
            const rate = Math.floor(Number(P1.selling_price ?? 1000) * 0.9);
            await bill(f, { items: [{ product_id: P1.id, rate, note: "Festive offer, 10% off" }] });
            await pay(f, "CASH");
            await giveOut(f);
            await SA("POST", `/finished-goods/${f.id}/credit-note`, { amount: rate, reason: "One piece damaged in transit" });
        }

        const T = await raise("Singh Agencies", lines([P2, 2]), day(10));
        for (const f of await toStore(T)) {
            await bill(f);
            await SA("POST", `/finished-goods/${f.id}/bill/cancel`, { reason: "Wrong billing address, make it again" });
        }

        // a rate agreed on the order, 5% under the price list: the bill starts from it, with the order's reason
        const agreed = Math.floor(Number(P1.selling_price ?? 1000) * 0.95);
        const U = await raise("Verma & Sons", [{ productId: P1.id, quantity: 2, rate: agreed, rate_note: "Annual contract" }], day(10));
        await toStore(U);

        // a regular customer gone quiet: an order every 30 days, then nothing for 60
        for (const ago of [120, 90, 60]) {
            const o = await raise("Joshi Electricals", lines([P2, 2]), day(10));
            for (const f of await toStore(o)) { await bill(f); await pay(f, "BANK", `NEFT ${ago}`); await giveOut(f); }
            await moveBack(o, ago);
        }
        checkpoint("9-sales-history", "bills of every age (K L M N unpaid), last month's sales (O P Q), this month's (R S), T and U to bill (U at an agreed rate), Joshi going quiet");
    } finally {
        server.close();
        await db.end().catch(() => {});
    }
}

main()
    .then(() => {
        console.log("\nDone. Load a stage with: npm run db:load <name>   (npm run db:list shows them all)");
    })
    .catch((err) => {
        console.error(`\nFAILED: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await dropCopy().catch((e) => console.error("could not drop the demo copy:", e.message));
        process.exit();
    });

const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/*
    The month report for the Super Admin / Operations Admin: four questions, one figure each, with the rows behind it.
        1. Money          sales, credit notes, money collected and still to collect, purchases, estimated profit
        2. Suppliers      per supplier: what IQC received / rejected (%), deliveries late against the promised date
        3. Quality check  batches decided for the FIRST time in the month: how many passed on the first try (%)
        4. Order time     orders delivered in the month: days from sent for approval to delivered, and where the time went
    Read only; every figure is worked out from the records the workflow already keeps.
*/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(raw) {
    const month = String(raw || "");
    if (!MONTH_RE.test(month)) throw new AppError(422, "Month must look like 2026-10", "VALIDATION");
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { month, start: `${month}-01`, end: `${next}-01` };
}

const n = (v) => Number(v || 0);
const pct = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : null);
const days = (v) => (v === null || v === undefined ? null : Number(Number(v).toFixed(1)));

/*
    Money of the month.
      billed      ACTIVE bills made in the month (a cancelled bill does not count)
      credited    credit notes made in the month (goods returned / bill reduced after the goods left)
      net sales   billed - credited
      collected   payments received in the month (by the date the money came)
      to collect  what customers still owe on every ACTIVE bill, whatever its month
      spent       purchase orders placed in the month: ordered quantity x rate per piece
      profit      on this month's bills: amount before GST - what the sold products cost, where a product costs its
                  BOM at the latest purchase rate of each component (an estimate: products with a component never
                  bought with a rate use the component's standard cost (counted in `estimatedProducts`); one with
                  neither is counted in `unpricedProducts` and left out)
*/
async function sales({ start, end }) {
    const [[billed]] = await db.query(
        `SELECT COUNT(*) AS bills, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(gst_amount), 0) AS gst, COALESCE(SUM(subtotal), 0) AS subtotal
         FROM bills WHERE status = 'ACTIVE' AND created_at >= ? AND created_at < ?`,
        [start, end]
    );
    const [[credited]] = await db.query(
        `SELECT COUNT(*) AS notes, COALESCE(SUM(amount), 0) AS amount FROM bill_credit_notes WHERE created_at >= ? AND created_at < ?`,
        [start, end]
    );
    const [[collected]] = await db.query(
        `SELECT COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS amount FROM bill_payments WHERE paid_on >= ? AND paid_on < ?`,
        [start, end]
    );
    // what is still owed, bill by bill (oldest first)
    const [owed] = await db.query(
        `SELECT b.bill_number, b.finished_goods_id, b.customer_name, b.created_at,
                b.total - COALESCE((SELECT SUM(amount) FROM bill_credit_notes WHERE bill_id = b.id), 0)
                        - COALESCE((SELECT SUM(amount) FROM bill_payments WHERE bill_id = b.id), 0) AS due
         FROM bills b WHERE b.status = 'ACTIVE'
         HAVING due > 0.004 ORDER BY b.created_at`
    );
    const [byCustomer] = await db.query(
        `SELECT customer_name AS name, COUNT(*) AS bills, SUM(total) AS total
         FROM bills WHERE status = 'ACTIVE' AND created_at >= ? AND created_at < ?
         GROUP BY customer_name ORDER BY total DESC LIMIT 10`,
        [start, end]
    );
    const now = Date.now();
    return {
        bills: n(billed.bills),
        total: n(billed.total),
        gst: n(billed.gst),
        credited: n(credited.amount),
        creditNotes: n(credited.notes),
        net: Number((n(billed.total) - n(credited.amount)).toFixed(2)),
        collected: n(collected.amount),
        payments: n(collected.payments),
        toCollect: Number(owed.reduce((sum, r) => sum + n(r.due), 0).toFixed(2)),
        owed: owed.slice(0, 10).map((r) => ({
            billNumber: r.bill_number, finishedGoodsId: r.finished_goods_id, customer: r.customer_name, due: Number(n(r.due).toFixed(2)),
            days: Math.floor((now - new Date(r.created_at).getTime()) / 86400000),
        })),
        byCustomer: byCustomer.map((r) => ({ name: r.name, bills: n(r.bills), total: n(r.total) })),
        subtotal: n(billed.subtotal),
    };
}

async function costs({ start, end }, salesFigures) {
    const [[spent]] = await db.query(
        `SELECT COALESCE(SUM(poi.quantity_ordered * poi.rate), 0) AS amount, COUNT(DISTINCT po.id) AS purchases
         FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
         WHERE po.created_at >= ? AND po.created_at < ?`,
        [start, end]
    );
    // latest purchase rate of every component
    const [rates] = await db.query(
        `SELECT poi.component_id, poi.rate
         FROM purchase_order_items poi
         JOIN (SELECT component_id, MAX(id) AS id FROM purchase_order_items WHERE rate IS NOT NULL GROUP BY component_id) last
           ON last.id = poi.id`
    );
    const rateOf = new Map(rates.map((r) => [r.component_id, n(r.rate)]));
    const [standard] = await db.query(`SELECT id, standard_cost FROM components WHERE standard_cost IS NOT NULL`);
    const standardOf = new Map(standard.map((r) => [r.id, n(r.standard_cost)]));
    const [bom] = await db.query(`SELECT product_id, component_id, quantity_required FROM product_bom`);
    const costOf = new Map();
    const unpriced = new Set();
    const estimated = new Set(); // products whose cost uses a standard cost (no purchase rate yet)
    for (const b of bom) {
        const rate = rateOf.has(b.component_id) ? rateOf.get(b.component_id) : standardOf.get(b.component_id);
        if (rate === undefined) { unpriced.add(b.product_id); continue; }
        if (!rateOf.has(b.component_id)) estimated.add(b.product_id);
        costOf.set(b.product_id, (costOf.get(b.product_id) || 0) + n(b.quantity_required) * rate);
    }
    const [sold] = await db.query(
        `SELECT bi.product_id, SUM(bi.quantity) AS quantity, SUM(bi.amount) AS amount
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
         WHERE b.status = 'ACTIVE' AND b.created_at >= ? AND b.created_at < ?
         GROUP BY bi.product_id`,
        [start, end]
    );
    let revenue = 0, cost = 0;
    const skipped = new Set();
    let estimatedSold = 0;
    for (const r of sold) {
        if (unpriced.has(r.product_id) || !costOf.has(r.product_id)) { skipped.add(r.product_id); continue; }
        if (estimated.has(r.product_id)) estimatedSold++;
        revenue += n(r.amount);
        cost += n(r.quantity) * costOf.get(r.product_id);
    }
    // a credit note lowers the month's income
    const profit = revenue - cost - salesFigures.credited;
    return {
        spent: Number(n(spent.amount).toFixed(2)),
        purchases: n(spent.purchases),
        costOfSold: Number(cost.toFixed(2)),
        profit: sold.length && skipped.size < sold.length ? Number(profit.toFixed(2)) : null,
        marginPct: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(1)) : null,
        unpricedProducts: skipped.size,
        // how many sold products were costed (partly) at standard cost instead of a real purchase rate
        estimatedProducts: estimatedSold,
    };
}

async function suppliers({ start, end }) {
    // IQC results of the month (by inspection date) and deliveries of the month (by promised or received date)
    const [rows] = await db.query(
        `SELECT po.supplier,
                COUNT(DISTINCT po.id) AS purchases,
                COALESCE(SUM(poi.quantity_received), 0) AS received,
                COALESCE(SUM(poi.quantity_defective), 0) AS rejected
         FROM purchase_orders po
         JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
         WHERE po.iqc_at >= ? AND po.iqc_at < ?
         GROUP BY po.supplier`,
        [start, end]
    );
    const [deliveries] = await db.query(
        `SELECT supplier,
                COUNT(*) AS due,
                SUM(GREATEST(0, DATEDIFF(COALESCE(DATE(received_at), CURDATE()), expected_delivery_date)) > 0) AS late,
                AVG(NULLIF(GREATEST(0, DATEDIFF(COALESCE(DATE(received_at), CURDATE()), expected_delivery_date)), 0)) AS avg_late_days
         FROM purchase_orders
         WHERE expected_delivery_date >= ? AND expected_delivery_date < ?
         GROUP BY supplier`,
        [start, end]
    );
    const bySupplier = new Map();
    const row = (name) => {
        if (!bySupplier.has(name)) bySupplier.set(name, { name, purchases: 0, received: 0, rejected: 0, due: 0, late: 0, avgLateDays: null });
        return bySupplier.get(name);
    };
    for (const r of rows) Object.assign(row(r.supplier), { purchases: n(r.purchases), received: n(r.received), rejected: n(r.rejected) });
    for (const d of deliveries) Object.assign(row(d.supplier), { due: n(d.due), late: n(d.late), avgLateDays: days(d.avg_late_days) });
    const list = [...bySupplier.values()]
        .map((s) => ({ ...s, rejectedPct: pct(s.rejected, s.received) }))
        .sort((a, b) => (b.rejectedPct ?? -1) - (a.rejectedPct ?? -1) || b.late - a.late);
    const received = list.reduce((sum, s) => sum + s.received, 0);
    const rejected = list.reduce((sum, s) => sum + s.rejected, 0);
    return {
        received,
        rejected,
        rejectedPct: pct(rejected, received),
        due: list.reduce((sum, s) => sum + s.due, 0),
        late: list.reduce((sum, s) => sum + s.late, 0),
        bySupplier: list,
    };
}

async function qualityCheck({ start, end }) {
    const [[first]] = await db.query(
        `SELECT COUNT(*) AS batches, COALESCE(SUM(decision = 'PASS'), 0) AS passed
         FROM quality_control_batch_decisions
         WHERE attempt_number = 1 AND decided_at >= ? AND decided_at < ?`,
        [start, end]
    );
    const [[all]] = await db.query(
        `SELECT COUNT(*) AS decisions, COALESCE(SUM(decision = 'FAIL'), 0) AS failed
         FROM quality_control_batch_decisions WHERE decided_at >= ? AND decided_at < ?`,
        [start, end]
    );
    const [reasons] = await db.query(
        `SELECT p.name AS product, COUNT(*) AS fails
         FROM quality_control_batch_decisions d
         JOIN production_orders po ON po.id = d.production_id
         JOIN order_items oi ON oi.id = po.order_item_id
         JOIN products p ON p.id = oi.product_id
         WHERE d.decision = 'FAIL' AND d.decided_at >= ? AND d.decided_at < ?
         GROUP BY p.name ORDER BY fails DESC LIMIT 5`,
        [start, end]
    );
    return {
        firstTryBatches: n(first.batches),
        firstTryPassed: n(first.passed),
        firstTryPassPct: pct(n(first.passed), n(first.batches)),
        decisions: n(all.decisions),
        failed: n(all.failed),
        failsByProduct: reasons.map((r) => ({ product: r.product, fails: n(r.fails) })),
    };
}

async function orderTime({ start, end }) {
    const [rows] = await db.query(
        `SELECT o.id AS order_id, o.order_number,
                TIMESTAMPDIFF(HOUR, COALESCE(o.sent_to_admin_at, o.created_at), fg.delivered_at) / 24 AS total_days,
                TIMESTAMPDIFF(HOUR, COALESCE(o.sent_to_admin_at, o.created_at), o.approved_at) / 24 AS approval_days,
                TIMESTAMPDIFF(HOUR, o.approved_at, fg.created_at) / 24 AS build_days,
                TIMESTAMPDIFF(HOUR, fg.created_at, fg.delivered_at) / 24 AS dispatch_days
         FROM finished_goods fg
         JOIN orders o ON o.id = fg.order_id
         WHERE fg.status = 'DELIVERED' AND fg.delivered_at >= ? AND fg.delivered_at < ?
         ORDER BY total_days DESC`,
        [start, end]
    );
    const avg = (key) => (rows.length ? days(rows.reduce((sum, r) => sum + n(r[key]), 0) / rows.length) : null);
    return {
        delivered: rows.length,
        avgDays: avg("total_days"),
        // where the time went, on average
        avgApprovalDays: avg("approval_days"),
        avgBuildDays: avg("build_days"),
        avgDispatchDays: avg("dispatch_days"),
        slowest: rows.slice(0, 5).map((r) => ({ orderId: r.order_id, orderNumber: r.order_number, days: days(r.total_days) })),
    };
}

async function monthly(rawMonth) {
    const range = monthRange(rawMonth);
    const [s, sup, qc, time] = await Promise.all([sales(range), suppliers(range), qualityCheck(range), orderTime(range)]);
    const money = await costs(range, s);
    return { month: range.month, sales: s, money, suppliers: sup, qualityCheck: qc, orderTime: time };
}

module.exports = { monthly, monthRange };

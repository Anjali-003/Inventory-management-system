const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/*
    The month report for the Super Admin / Operations Admin: four questions, one figure each, with the rows behind it.
        1. Sales          bills made in the month (₹), by customer
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

async function sales({ start, end }) {
    const [[total]] = await db.query(
        `SELECT COUNT(*) AS bills, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(gst_amount), 0) AS gst
         FROM bills WHERE created_at >= ? AND created_at < ?`,
        [start, end]
    );
    const [byCustomer] = await db.query(
        `SELECT customer_name AS name, COUNT(*) AS bills, SUM(total) AS total
         FROM bills WHERE created_at >= ? AND created_at < ?
         GROUP BY customer_name ORDER BY total DESC LIMIT 10`,
        [start, end]
    );
    return {
        bills: n(total.bills),
        total: n(total.total),
        gst: n(total.gst),
        byCustomer: byCustomer.map((r) => ({ name: r.name, bills: n(r.bills), total: n(r.total) })),
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
        `SELECT o.order_number,
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
        slowest: rows.slice(0, 5).map((r) => ({ orderNumber: r.order_number, days: days(r.total_days) })),
    };
}

async function monthly(rawMonth) {
    const range = monthRange(rawMonth);
    const [s, sup, qc, time] = await Promise.all([sales(range), suppliers(range), qualityCheck(range), orderTime(range)]);
    return { month: range.month, sales: s, suppliers: sup, qualityCheck: qc, orderTime: time };
}

module.exports = { monthly };

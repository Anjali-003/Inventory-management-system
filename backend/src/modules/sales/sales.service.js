const db = require("../../config/db");
const reports = require("../reports/report.service");

/*
    Sales & Billing for the Marketing Manager: every bill with what was paid and what is still due, and the month's
    money (same figures as Reports, so both always agree). Read only: bills are made, paid, cancelled and credited
    through the finished-goods routes, where each action checks its role.
*/
const n = (v) => Number(v || 0);
const round = (v) => Math.round(v * 100) / 100;

async function listBills() {
    const [rows] = await db.query(
        `SELECT b.id, b.bill_number, b.finished_goods_id, b.order_id, o.order_number, b.customer_id, b.customer_name,
                b.subtotal, b.gst_amount, b.total, b.status, b.created_at, b.cancel_reason, fg.status AS goods_status,
                u.name AS created_by_name,
                (SELECT COALESCE(SUM(amount), 0) FROM bill_payments WHERE bill_id = b.id) AS paid,
                (SELECT COALESCE(SUM(amount), 0) FROM bill_credit_notes WHERE bill_id = b.id) AS credited,
                (SELECT MAX(paid_on) FROM bill_payments WHERE bill_id = b.id) AS last_paid_on
         FROM bills b
         JOIN orders o ON o.id = b.order_id
         JOIN finished_goods fg ON fg.id = b.finished_goods_id
         LEFT JOIN users u ON u.id = b.created_by
         ORDER BY b.id DESC
         LIMIT 500`
    );
    const now = Date.now();
    return rows.map((r) => {
        const net = round(n(r.total) - n(r.credited));
        const due = r.status === "ACTIVE" ? Math.max(0, round(net - n(r.paid))) : 0;
        return {
            id: r.id,
            billNumber: r.bill_number,
            finishedGoodsId: r.finished_goods_id,
            orderId: r.order_id,
            orderNumber: r.order_number,
            customerId: r.customer_id,
            customerName: r.customer_name,
            total: n(r.total),
            credited: n(r.credited),
            net,
            paid: n(r.paid),
            due,
            status: r.status,
            paymentStatus: r.status !== "ACTIVE" ? "CANCELLED" : due === 0 ? "PAID" : n(r.paid) > 0 ? "PART_PAID" : "UNPAID",
            goodsStatus: r.goods_status,
            cancelReason: r.cancel_reason,
            createdAt: r.created_at,
            createdByName: r.created_by_name,
            lastPaidOn: r.last_paid_on,
            days: Math.floor((now - new Date(r.created_at).getTime()) / 86400000),
        };
    });
}

/* every payment that came in during the month (by the date the money came): the rows behind "Received this month" */
async function listPayments(month) {
    const { start, end } = reports.monthRange(month);
    const [rows] = await db.query(
        `SELECT bp.id, bp.bill_id, bp.amount, bp.paid_on, bp.method, bp.reference, bp.created_at, u.name AS created_by_name,
                b.bill_number, b.finished_goods_id, b.order_id, b.customer_id, b.customer_name, b.status AS bill_status, o.order_number
         FROM bill_payments bp
         JOIN bills b ON b.id = bp.bill_id
         JOIN orders o ON o.id = b.order_id
         LEFT JOIN users u ON u.id = bp.created_by
         WHERE bp.paid_on >= ? AND bp.paid_on < ?
         ORDER BY bp.paid_on DESC, bp.id DESC`,
        [start, end]
    );
    return rows.map((r) => ({
        id: r.id,
        billId: r.bill_id,
        billNumber: r.bill_number,
        billStatus: r.bill_status,
        finishedGoodsId: r.finished_goods_id,
        orderId: r.order_id,
        orderNumber: r.order_number,
        customerId: r.customer_id,
        customerName: r.customer_name,
        amount: n(r.amount),
        paidOn: r.paid_on,
        method: r.method,
        reference: r.reference,
        createdAt: r.created_at,
        createdByName: r.created_by_name,
    }));
}

/* the month before "2026-01" is "2025-12" */
function previousMonth(month) {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/*
    Net sales (bills after credit notes, as `net`) of the 6 months ending with `month`, oldest first:
    [{ month: "2026-05", net }, ...]. Two grouped queries, not 6 month reports.
*/
async function trend(month) {
    const months = [month];
    while (months.length < 6) months.unshift(previousMonth(months[0]));
    const start = reports.monthRange(months[0]).start;
    const { end } = reports.monthRange(month);
    const [billed] = await db.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, SUM(total) AS total FROM bills
         WHERE status = 'ACTIVE' AND created_at >= ? AND created_at < ? GROUP BY m`,
        [start, end]
    );
    const [credited] = await db.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, SUM(amount) AS amount FROM bill_credit_notes
         WHERE created_at >= ? AND created_at < ? GROUP BY m`,
        [start, end]
    );
    const of = (rows, key) => new Map(rows.map((r) => [r.m, n(r[key])]));
    const b = of(billed, "total");
    const c = of(credited, "amount");
    return months.map((m) => ({ month: m, net: round((b.get(m) || 0) - (c.get(m) || 0)) }));
}

/*
    What sold best in the month: one row per product billed (ACTIVE bills made in the month), biggest amount first,
    the top 10: { productId, name, sku, units, amount, customers, share }. share = % of everything billed for
    products that month. Amounts are the bill lines' (a credit note reduces a whole bill, not a product line).
*/
async function topProducts(month, costed = []) {
    const { start, end } = reports.monthRange(month);
    const [rows] = await db.query(
        `SELECT p.id, p.name, p.sku, SUM(bi.quantity) AS units, SUM(bi.amount) AS amount, COUNT(DISTINCT b.customer_name) AS customers
         FROM bill_items bi
         JOIN bills b ON b.id = bi.bill_id
         JOIN products p ON p.id = bi.product_id
         WHERE b.status = 'ACTIVE' AND b.created_at >= ? AND b.created_at < ?
         GROUP BY p.id, p.name, p.sku
         ORDER BY amount DESC, units DESC`,
        [start, end]
    );
    const total = rows.reduce((sum, r) => sum + n(r.amount), 0);
    // margin % per product from the month report's costing (null: a product that could not be costed)
    const marginOf = new Map(costed.filter((c) => c.soldFor > 0).map((c) => [c.productId, Math.round((c.profit / c.soldFor) * 100)]));
    return rows.slice(0, 10).map((r) => ({
        productId: r.id, name: r.name, sku: r.sku, units: n(r.units), amount: round(n(r.amount)), customers: n(r.customers),
        share: total > 0 ? Math.round((n(r.amount) / total) * 100) : 0,
        margin: marginOf.has(r.id) ? marginOf.get(r.id) : null,
    }));
}

/* the month's money (and last month's, to compare, and the 6 months' trend) + what still has to be billed (orders in
   the Store without a bill) */
async function summary(month) {
    const { sales, money } = await reports.monthly(month);
    const lastRange = reports.monthRange(previousMonth(month));
    const last = await reports.sales(lastRange);
    const lastMoney = await reports.costs(lastRange, last);
    const [[toBill]] = await db.query(`SELECT COUNT(*) AS n FROM finished_goods WHERE status = 'IN_STORE'`);
    return {
        month,
        net: sales.net,
        billed: sales.total,
        credited: sales.credited,
        bills: sales.bills,
        collected: sales.collected,
        toCollect: sales.toCollect,
        owed: sales.owed,
        ageing: sales.ageing,
        lastMonth: { net: last.net, collected: last.collected },
        trend: await trend(month),
        byCustomer: sales.byCustomer,
        byProduct: await topProducts(month, money.products),
        /*
            Gross margin %, the month and the month before (the same estimate as Reports: what was sold minus what its
            parts cost at their latest purchase rate, and credit notes; no labour or overheads). Only the percentages
            go to Marketing, never the costs. estimated: some parts costed at their standard cost (never bought yet);
            uncosted: products sold that could not be costed at all (left out of the margin).
        */
        margin: { pct: money.marginPct, lastPct: lastMoney.marginPct, estimated: money.estimatedProducts > 0, uncosted: money.unpricedProducts },
        toBill: n(toBill.n),
    };
}

module.exports = { listBills, listPayments, summary };

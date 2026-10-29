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

/* the month's money (and last month's, to compare) + what still has to be billed (orders in the Store without a bill) */
async function summary(month) {
    const { sales } = await reports.monthly(month);
    const last = await reports.sales(reports.monthRange(previousMonth(month)));
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
        byCustomer: sales.byCustomer,
        toBill: n(toBill.n),
    };
}

module.exports = { listBills, listPayments, summary };

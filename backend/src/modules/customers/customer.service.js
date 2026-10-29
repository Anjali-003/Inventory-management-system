const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/* Saved customers for Marketing's bills (name is unique, so the list never shows the same customer twice). */

function cleanText(raw, max, label) {
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (text.length > max) throw new AppError(422, `${label} must be ${max} characters or fewer`, "VALIDATION");
    return text || null;
}

function parseCustomer(body) {
    const name = cleanText(body.name, 150, "Name");
    if (!name || name.length < 2) throw new AppError(422, "Customer name must be at least 2 characters", "VALIDATION", { field: "name" });
    return {
        name,
        address: cleanText(body.address, 500, "Address"),
        gstin: cleanText(body.gstin, 20, "GSTIN"),
        phone: cleanText(body.phone, 20, "Phone"),
    };
}

const money = (v) => Math.round(Number(v || 0) * 100) / 100;

/*
    "Going quiet": a regular customer whose next order is late. Its usual gap is the days from its first order to its
    last, shared out over the gaps between them (2 orders at least; drafts do not count). It is going quiet when the
    days since its last order are more than 1.5 times that gap. The gap is taken as 7 days at least, so a customer who
    ordered twice on the same day is not "late" the next morning.
*/
const QUIET_FACTOR = 1.5;
const MIN_GAP_DAYS = 7;
function orderRhythm(r) {
    const orders = Number(r.orders || 0);
    const since = r.days_since_order === null || r.days_since_order === undefined ? null : Number(r.days_since_order);
    const usualGap = orders >= 2 ? Math.max(MIN_GAP_DAYS, Math.round(Number(r.order_span_days) / (orders - 1))) : null;
    return {
        orders,
        lastOrderAt: r.last_order_at || null,
        daysSinceOrder: since,
        usualGapDays: usualGap,
        goingQuiet: usualGap !== null && since > usualGap * QUIET_FACTOR,
    };
}

const mapRow = (r) => ({
    id: r.id, name: r.name, address: r.address, gstin: r.gstin, phone: r.phone,
    bills: Number(r.bills || 0),
    // bought = bills after credit notes; due = what the customer still owes
    bought: money(Number(r.billed || 0) - Number(r.credited || 0)),
    paid: money(r.paid),
    due: Math.max(0, money(Number(r.billed || 0) - Number(r.credited || 0) - Number(r.paid || 0))),
    lastBillAt: r.last_bill_at || null,
    ...orderRhythm(r),
});

async function list() {
    const [rows] = await db.query(
        `SELECT c.*,
                (SELECT COUNT(*) FROM bills b WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS bills,
                (SELECT COALESCE(SUM(b.total), 0) FROM bills b WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS billed,
                (SELECT COALESCE(SUM(cn.amount), 0) FROM bill_credit_notes cn JOIN bills b ON b.id = cn.bill_id
                  WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS credited,
                (SELECT COALESCE(SUM(bp.amount), 0) FROM bill_payments bp JOIN bills b ON b.id = bp.bill_id
                  WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS paid,
                (SELECT MAX(b.created_at) FROM bills b WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS last_bill_at,
                os.orders, os.order_span_days, os.days_since_order, os.last_order_at
         FROM customers c
         LEFT JOIN (
             SELECT customer_id, COUNT(*) AS orders, MAX(created_at) AS last_order_at,
                    DATEDIFF(MAX(created_at), MIN(created_at)) AS order_span_days, DATEDIFF(NOW(), MAX(created_at)) AS days_since_order
             FROM orders WHERE customer_id IS NOT NULL AND approval_status <> 'DRAFT' GROUP BY customer_id
         ) os ON os.customer_id = c.id
         ORDER BY c.name`
    );
    return rows.map(mapRow);
}

async function create(body, userId) {
    const c = parseCustomer(body);
    try {
        const [res] = await db.query(
            `INSERT INTO customers (name, address, gstin, phone, created_by) VALUES (?, ?, ?, ?, ?)`,
            [c.name, c.address, c.gstin, c.phone, userId]
        );
        return { id: res.insertId, ...c, bills: 0 };
    } catch (error) {
        if (error.errno === 1062) throw AppError.conflict(`A customer named "${c.name}" is already saved`, "DUPLICATE_CUSTOMER");
        throw error;
    }
}

async function update(id, body) {
    const c = parseCustomer(body);
    try {
        const [res] = await db.query(
            `UPDATE customers SET name = ?, address = ?, gstin = ?, phone = ? WHERE id = ?`,
            [c.name, c.address, c.gstin, c.phone, id]
        );
        if (!res.affectedRows) throw AppError.notFound("Customer not found", "NOT_FOUND");
        return { id, ...c };
    } catch (error) {
        if (error.errno === 1062) throw AppError.conflict(`A customer named "${c.name}" is already saved`, "DUPLICATE_CUSTOMER");
        throw error;
    }
}

module.exports = { list, create, update };

const db = require("../config/db");
const { HttpError } = require("./inventoryService");

/*
    Cumulative Inventory History (read-only).

    ONE aggregate number: the total count of components ever brought into stock, summed across ALL
    components (not per component) and carried forward month after month - it never resets.

        cumulative = starting inventory (baseline) + everything received since

    There is no new table and no second copy of inventory logic: every figure is derived from the
    existing append-only `inventory_transactions` ledger, using only these two row kinds -

        OPENING_BALANCE  -> starting / baseline inventory (migration 005 + seed data)
        STOCK_IN         -> incoming / received components (single and batch stock-in)

    Everything else in the ledger is deliberately ignored: RESERVED / RELEASED / CONSUMED
    (production), ADJUSTMENT_IN / ADJUSTMENT_OUT, STOCK_OUT, ARCHIVED, and anything about
    Finished Products / BOM. Quantities are summed as integer hundredths (DECIMAL(12,2)) so there
    is no float drift, the same way inventoryService does it.
*/

const COUNTED = `t.transaction_type IN ('OPENING_BALANCE', 'STOCK_IN')`;

// Baseline rows are normally IN; an OUT baseline (stock that was over-explained) counts negatively.
const BASELINE_QTY = `CASE WHEN t.transaction_type = 'OPENING_BALANCE'
                           THEN CASE t.direction WHEN 'IN' THEN t.quantity WHEN 'OUT' THEN -t.quantity ELSE 0 END
                           ELSE 0 END`;
const RECEIVED_QTY = `CASE WHEN t.transaction_type = 'STOCK_IN' AND t.direction = 'IN' THEN t.quantity ELSE 0 END`;
const RECEIPT_ROW = `CASE WHEN t.transaction_type = 'STOCK_IN' AND t.direction = 'IN' THEN 1 ELSE 0 END`;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const cents = (v) => Math.round(Number(v ?? 0) * 100);
const num = (c) => c / 100;

const pad = (n) => String(n).padStart(2, "0");
const nextMonth = (m) => {
    const [y, mo] = m.split("-").map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
};
const daysIn = (m) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo, 0).getDate();
};

/* "Today" and the current month come from the database so they match the clock that stamps created_at. */
async function dbToday() {
    const [[r]] = await db.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`);
    return r.today;
}

/* ------------------------------------------------------------- month view */
/*
    One row per calendar month from the first month with any counted movement up to the current
    month. Months with no receipts are still listed so the cumulative total visibly carries over.
*/
async function getMonthlyHistory() {
    const today = await dbToday();
    const currentMonth = today.slice(0, 7);

    const [rows] = await db.query(
        `
        SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
               SUM(${BASELINE_QTY}) AS baseline,
               SUM(${RECEIVED_QTY}) AS received,
               SUM(${RECEIPT_ROW}) AS receipt_count
        FROM inventory_transactions t
        WHERE ${COUNTED}
        GROUP BY month
        ORDER BY month
        `
    );

    if (rows.length === 0) {
        return {
            today,
            current_month: currentMonth,
            first_month: null,
            baseline_total: 0,
            received_total: 0,
            cumulative_total: 0,
            months: [],
        };
    }

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const months = [];
    let running = 0;
    let baselineSum = 0;
    let receivedSum = 0;

    const first = rows[0].month;
    const last = rows[rows.length - 1].month > currentMonth ? rows[rows.length - 1].month : currentMonth;

    for (let m = first; m <= last; m = nextMonth(m)) {
        const r = byMonth.get(m);
        const baseline = cents(r?.baseline);
        const received = cents(r?.received);
        const opening = running;
        running += baseline + received;
        baselineSum += baseline;
        receivedSum += received;
        months.push({
            month: m,
            opening_cumulative: num(opening),
            baseline: num(baseline),
            received: num(received),
            receipt_count: Number(r?.receipt_count || 0),
            cumulative: num(running),
        });
    }

    return {
        today,
        current_month: currentMonth,
        first_month: first,
        baseline_total: num(baselineSum),
        received_total: num(receivedSum),
        cumulative_total: num(running),
        months,
    };
}

/* --------------------------------------------------------------- day view */
/*
    Day-by-day snapshots for one month. `cumulative` on each day is the carried-forward total at the
    END of that day; it starts from the closing total of the previous month.
*/
async function getDailyHistory(monthRaw) {
    const month = String(monthRaw || "");
    if (!MONTH_RE.test(month)) {
        throw new HttpError(400, "month must be in YYYY-MM format", "VALIDATION");
    }
    const today = await dbToday();
    const start = `${month}-01`;
    const end = `${nextMonth(month)}-01`;

    const [[before]] = await db.query(
        `SELECT SUM(${BASELINE_QTY}) AS baseline, SUM(${RECEIVED_QTY}) AS received
           FROM inventory_transactions t
          WHERE ${COUNTED} AND t.created_at < ?`,
        [start]
    );
    const opening = cents(before.baseline) + cents(before.received);

    const [rows] = await db.query(
        `
        SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') AS day,
               SUM(${BASELINE_QTY}) AS baseline,
               SUM(${RECEIVED_QTY}) AS received,
               SUM(${RECEIPT_ROW}) AS receipt_count
        FROM inventory_transactions t
        WHERE ${COUNTED} AND t.created_at >= ? AND t.created_at < ?
        GROUP BY day
        ORDER BY day
        `,
        [start, end]
    );
    const byDay = new Map(rows.map((r) => [r.day, r]));

    // Do not list days that have not happened yet in the current month.
    const lastDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : month > today.slice(0, 7) ? 0 : daysIn(month);

    let running = opening;
    let baselineSum = 0;
    let receivedSum = 0;
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
        const key = `${month}-${pad(d)}`;
        const r = byDay.get(key);
        const baseline = cents(r?.baseline);
        const received = cents(r?.received);
        running += baseline + received;
        baselineSum += baseline;
        receivedSum += received;
        days.push({
            date: key,
            baseline: num(baseline),
            received: num(received),
            receipt_count: Number(r?.receipt_count || 0),
            cumulative: num(running),
        });
    }

    return {
        month,
        opening_cumulative: num(opening),
        baseline: num(baselineSum),
        received: num(receivedSum),
        closing_cumulative: num(running),
        days,
    };
}

/* ------------------------------------------------- finished products view */
/*
    One entry per finished product:
        produced            = units of it in finished_goods (all statuses: packaging, dispatched, completed)
        components_per_unit = sum of the BOM quantities for ONE unit of that product
        components_used     = produced x components_per_unit
    Read-only, derived from finished_goods / order_items / product_bom. Stock is never touched.
*/
async function getFinishedProductsUsage() {
    const [rows] = await db.query(
        `
        SELECT p.id AS product_id, p.sku, p.name,
               f.produced,
               COALESCE(b.per_unit, 0) AS components_per_unit,
               COALESCE(b.bom_lines, 0) AS bom_lines
        FROM (
            SELECT oi.product_id, SUM(fg.quantity) AS produced
            FROM finished_goods fg
            JOIN order_items oi ON oi.order_id = fg.order_id
            GROUP BY oi.product_id
        ) f
        JOIN products p ON p.id = f.product_id
        LEFT JOIN (
            SELECT product_id, SUM(quantity_required) AS per_unit, COUNT(*) AS bom_lines
            FROM product_bom
            GROUP BY product_id
        ) b ON b.product_id = p.id
        ORDER BY p.name
        `
    );
    const products = rows.map((r) => {
        const produced = Number(r.produced);
        const perUnit = cents(r.components_per_unit);
        return {
            product_id: r.product_id,
            sku: r.sku,
            name: r.name,
            produced,
            components_per_unit: num(perUnit),
            bom_lines: Number(r.bom_lines),
            components_used: num(produced * perUnit),
        };
    });
    const totalUsedC = products.reduce((sum, p) => sum + cents(p.components_used), 0);
    return { products, total_components_used: num(totalUsedC) };
}

/* ------------------------------------------------------------ balance sheet */
/*
    Received  (baseline + received, cumulative)
  - Used      (sum of components_used over ALL finished products)
  = Expected remaining
    Actual on hand = SUM(inventory.quantity_on_hand)
    Difference     = actual - expected  (0 = books match, < 0 = short, > 0 = extra)

    When actual is short, the ledger says WHERE the pieces went. Everything that lowers on-hand stock
    other than finished goods is listed with its reason, quantity and worker:

        consumed in production but not finished yet   (CONSUMED  - components_used)
        manual stock-out, by reason                   (STOCK_OUT: damaged, R&D, returned to supplier, ...)
        count adjustments                             (ADJUSTMENT_OUT minus ADJUSTMENT_IN)

        unexplained = difference + in_production + explained_total      (0 = the shortfall is fully accounted for)

    Read-only; no stock is touched.
*/
const REASON_LABELS = {
    ISSUED_TO_PRODUCTION: "Issued to production",
    PRODUCTION_WASTAGE: "Production wastage / rejected",
    DAMAGED: "Damaged / scrapped",
    REPLACEMENT: "Replacement issued",
    QUALITY_CONTROL: "Quality control / inspection",
    TESTING: "Testing / trial",
    RND: "R&D / experiment",
    REWORK: "Rework / repair",
    CUSTOMER_SAMPLE: "Customer sample / demo",
    WARRANTY: "Warranty / customer replacement",
    LOST: "Lost / missing",
    WRONG_ISSUE: "Issued by mistake / excess",
    RETURNED_TO_SUPPLIER: "Returned to supplier",
    SAMPLE_TESTING: "Sample / testing",
    OTHER: "Other",
    ADJUSTMENT: "Stock count adjustment",
};

// New rows carry reason_code. Rows written before it existed are matched from their free-text reason.
const REASON_CODE_SQL = `
    CASE
        WHEN t.transaction_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN 'ADJUSTMENT'
        WHEN t.reason_code IS NOT NULL THEN t.reason_code
        WHEN t.reason LIKE 'Issued to production%' THEN 'ISSUED_TO_PRODUCTION'
        WHEN t.reason LIKE 'Damaged%' THEN 'DAMAGED'
        WHEN t.reason LIKE 'Returned to supplier%' THEN 'RETURNED_TO_SUPPLIER'
        WHEN t.reason LIKE 'R&D%' THEN 'RND'
        WHEN t.reason LIKE 'Sample%' THEN 'SAMPLE_TESTING'
        ELSE 'OTHER'
    END`;
// Positive = stock that left; an ADJUSTMENT_IN (count found extra) is negative.
const LEAVING_QTY = `CASE t.transaction_type WHEN 'ADJUSTMENT_IN' THEN -t.quantity ELSE t.quantity END`;
const LEAVING_TYPES = `t.transaction_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT', 'ADJUSTMENT_IN')`;

async function getBalanceSheet() {
    const monthly = await getMonthlyHistory();
    const { products } = await getFinishedProductsUsage();

    const receivedC = cents(monthly.cumulative_total);
    const usedC = products.reduce((sum, p) => sum + cents(p.components_used), 0);
    const expectedC = receivedC - usedC;

    const [[row]] = await db.query(`SELECT COALESCE(SUM(quantity_on_hand), 0) AS on_hand FROM inventory`);
    const actualC = cents(row.on_hand);
    const differenceC = actualC - expectedC;

    const [[cons]] = await db.query(
        `SELECT COALESCE(SUM(quantity), 0) AS consumed
           FROM inventory_transactions
          WHERE transaction_type = 'CONSUMED' AND direction = 'OUT'`
    );
    const inProductionC = cents(cons.consumed) - usedC;

    const [groups] = await db.query(
        `
        SELECT ${REASON_CODE_SQL} AS code,
               SUM(${LEAVING_QTY}) AS quantity,
               COUNT(*) AS movements
          FROM inventory_transactions t
         WHERE ${LEAVING_TYPES}
         GROUP BY code
         ORDER BY quantity DESC
        `
    );
    const byReason = groups.map((g) => ({
        code: g.code,
        label: REASON_LABELS[g.code] || g.code,
        quantity: num(cents(g.quantity)),
        movements: Number(g.movements),
    }));
    const explainedC = groups.reduce((sum, g) => sum + cents(g.quantity), 0);

    // Component-wise detail: newest 200 movements, with the worker and who recorded it.
    const [moves] = await db.query(
        `
        SELECT t.id,
               DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
               c.sku, c.name AS component_name, c.unit,
               t.transaction_type,
               ${REASON_CODE_SQL} AS code,
               ${LEAVING_QTY} AS quantity,
               t.reason, t.reference_no,
               e.name AS worker_name, e.employee_code AS worker_code,
               u.name AS recorded_by
          FROM inventory_transactions t
          JOIN components c ON c.id = t.component_id
          LEFT JOIN employees e ON e.id = t.employee_id
          LEFT JOIN users u ON u.id = t.created_by
         WHERE ${LEAVING_TYPES}
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT 200
        `
    );

    return {
        received_total: num(receivedC),
        components_used: num(usedC),
        expected_remaining: num(expectedC),
        actual_on_hand: num(actualC),
        difference: num(differenceC),
        shortfall: {
            in_production: num(inProductionC),
            by_reason: byReason,
            explained_total: num(explainedC),
            unexplained: num(differenceC + inProductionC + explainedC),
            movements: moves.map((m) => ({
                id: m.id,
                created_at: m.created_at,
                sku: m.sku,
                component_name: m.component_name,
                unit: m.unit,
                type: m.transaction_type,
                code: m.code,
                reason_label: REASON_LABELS[m.code] || m.code,
                quantity: num(cents(m.quantity)),
                reason: m.reason,
                reference_no: m.reference_no,
                worker_name: m.worker_name,
                worker_code: m.worker_code,
                recorded_by: m.recorded_by,
            })),
        },
    };
}

module.exports = { getMonthlyHistory, getDailyHistory, getFinishedProductsUsage, getBalanceSheet };

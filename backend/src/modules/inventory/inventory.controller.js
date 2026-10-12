const svc = require("./inventory.service");
const history = require("./inventory-history.service");

/* Wraps a handler so thrown errors become clean JSON responses. */
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof svc.HttpError) {
            return res.status(error.status).json({
                message: error.message,
                code: error.code,
                ...(error.extra || {}),
            });
        }
        if (error.errno === 1264 || error.errno === 1690) {
            return res.status(422).json({ message: "Quantity is out of the allowed range", code: "VALIDATION" });
        }
        if (error.sqlState === "45000") {
            // append-only trigger: someone tried to rewrite history
            return res.status(403).json({ message: error.message, code: "LEDGER_IMMUTABLE" });
        }
        console.error(error);
        res.status(500).json({ message: "Inventory operation failed", code: "SERVER_ERROR" });
    }
};

// READ -------------------------------------------------------------------
const list = handle(async (req, res) => {
    const status = ["active", "archived", "all"].includes(req.query.status) ? req.query.status : "active";
    res.json(await svc.listInventory({ status }));
});

const ledger = handle(async (req, res) => {
    res.json(await svc.getLedger(req.query));
});

// Type-ahead search for the component picker: ?q=red led&limit=8  ->  { rows, total }
const componentOptions = handle(async (req, res) => {
    res.json(await svc.listComponentOptions({ q: req.query.q, limit: req.query.limit }));
});

// Default SKU offered when a new component is created
const nextComponentSku = handle(async (req, res) => {
    res.json({ sku: await svc.nextSku() });
});

// Cumulative inventory history: ONE aggregate total (baseline + received), carried across months.
const monthlyHistory = handle(async (req, res) => {
    res.json(await history.getMonthlyHistory());
});

// Day-by-day snapshots for one month: ?month=2026-09
const dailyHistory = handle(async (req, res) => {
    res.json(await history.getDailyHistory(req.query.month));
});

// Finished products: quantity produced x components in one unit = components used. Read-only.
const productsUsage = handle(async (req, res) => {
    res.json(await history.getFinishedProductsUsage());
});

// Balance sheet: received - components used = expected remaining, compared with actual on hand. Read-only.
const balanceSheet = handle(async (req, res) => {
    res.json(await history.getBalanceSheet());
});

const getItem = handle(async (req, res) => {
    res.json(await svc.getItem(req.params.id));
});

// WRITE ------------------------------------------------------------------
// Add / IN (creates the inventory row on first receipt, reactivates an archived one)
const stockIn = handle(async (req, res) => {
    const result = await svc.stockIn(req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
});

// Add-to-list receipt: many lines (existing and/or new components) posted in ONE transaction
const stockInBatch = handle(async (req, res) => {
    const result = await svc.stockInBatch(req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
});

// OUT
const stockOut = handle(async (req, res) => {
    const result = await svc.stockOut(req.params.id, req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
});

// Edit / Adjustment (counted quantity and/or minimum stock level)
const updateItem = handle(async (req, res) => {
    res.json(await svc.updateItem(req.params.id, req.body || {}, req.user.id));
});

// Safe delete = archive. Only possible at zero stock; the ledger is never touched.
const archiveItem = handle(async (req, res) => {
    res.json(await svc.archiveItem(req.params.id, req.body || {}, req.user.id));
});

module.exports = {
    list, ledger, componentOptions, nextComponentSku,
    monthlyHistory, dailyHistory, productsUsage, balanceSheet,
    getItem, stockIn, stockInBatch, stockOut, updateItem, archiveItem,
};

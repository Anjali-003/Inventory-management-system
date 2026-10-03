const express = require("express");
const db = require("../config/db");
const svc = require("../services/inventoryService");

const router = express.Router();

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

/*
    The teammate's authMiddleware (mounted in server.js) has already checked the login cookie and put
    the JWT payload on req.user ({ userId, email, role }). inventory_transactions.created_by references
    users(id), so confirm that user still exists and expose it as req.user.id / req.user.name.
*/
async function resolveUser(req, res, next) {
    try {
        const id = Number(req.user && req.user.userId);
        const [rows] = await db.query("SELECT id, name FROM users WHERE id = ?", [id]);
        if (rows.length === 0) {
            return res.status(401).json({ message: "Unknown user", code: "UNKNOWN_USER" });
        }
        req.user = { ...req.user, ...rows[0] };
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not identify user", code: "SERVER_ERROR" });
    }
}

// READ -------------------------------------------------------------------
router.get("/", handle(async (req, res) => {
    const status = ["active", "archived", "all"].includes(req.query.status) ? req.query.status : "active";
    res.json(await svc.listInventory({ status }));
}));

router.get("/ledger", handle(async (req, res) => {
    res.json(await svc.getLedger(req.query));
}));

// Type-ahead search for the component picker: ?q=red led&limit=8  ->  { rows, total }
router.get("/components", handle(async (req, res) => {
    res.json(await svc.listComponentOptions({ q: req.query.q, limit: req.query.limit }));
}));

// Default SKU offered when a new component is created
router.get("/components/next-sku", handle(async (req, res) => {
    res.json({ sku: await svc.nextSku() });
}));

router.get("/:id", handle(async (req, res) => {
    res.json(await svc.getItem(req.params.id));
}));

// WRITE ------------------------------------------------------------------
// Add / IN (creates the inventory row on first receipt, reactivates an archived one)
router.post("/stock-in", resolveUser, handle(async (req, res) => {
    const result = await svc.stockIn(req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
}));

// Add-to-list receipt: many lines (existing and/or new components) posted in ONE transaction
router.post("/stock-in/batch", resolveUser, handle(async (req, res) => {
    const result = await svc.stockInBatch(req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
}));

// OUT
router.post("/:id/stock-out", resolveUser, handle(async (req, res) => {
    const result = await svc.stockOut(req.params.id, req.body || {}, req.user.id);
    res.status(result.replayed ? 200 : 201).json(result);
}));

// Edit / Adjustment (counted quantity and/or minimum stock level)
router.put("/:id", resolveUser, handle(async (req, res) => {
    res.json(await svc.updateItem(req.params.id, req.body || {}, req.user.id));
}));

// Safe delete = archive. Only possible at zero stock; the ledger is never touched.
router.delete("/:id", resolveUser, handle(async (req, res) => {
    res.json(await svc.archiveItem(req.params.id, req.body || {}, req.user.id));
}));

module.exports = router;

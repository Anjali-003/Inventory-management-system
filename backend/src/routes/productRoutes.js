const express = require("express");
const db = require("../config/db");
const svc = require("../services/productService");

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
                ...(error.extra || {})
            });
        }
        console.error(error);
        res.status(500).json({ message: "Product operation failed", code: "SERVER_ERROR" });
    }
};

const productId = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new svc.HttpError(404, "Product not found", "NOT_FOUND");
    return id;
};

router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM products ORDER BY id"
        );

        res.json(rows);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch products"
        });
    }
});

// Default SKU offered in the "Add product" form. Must stay above "/:id".
router.get("/next-sku", handle(async (req, res) => {
    res.json({ sku: await svc.nextProductSku() });
}));

// Add one product by hand: { sku?, name, description? }  (blank SKU -> next PRD-###)
router.post("/", handle(async (req, res) => {
    res.status(201).json(await svc.createProduct(req.body));
}));

// Add many products from a spreadsheet the browser has read: { rows: [{ line, sku, name, description }], dryRun }
router.post("/import", handle(async (req, res) => {
    res.json(await svc.importProducts({ rows: req.body && req.body.rows, dryRun: !!(req.body && req.body.dryRun) }));
}));

router.get("/:id", async (req, res) => {
    try {
        const productId = Number(req.params.id);

        const [rows] = await db.query(
            "SELECT * FROM products WHERE id = ?",
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch product"
        });
    }
});

router.get("/:id/bom", async (req, res) => {
    try {
        // A product with no BOM yet is not an error: this returns an empty list.
        res.json(await svc.getBom(db, Number(req.params.id)));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch BOM"
        });
    }
});

// Replace the whole BOM from the editor: { lines: [{ component_id | newComponent, quantity_required, location }] }
router.put("/:id/bom", handle(async (req, res) => {
    res.json(await svc.saveBom(productId(req), req.body));
}));

// Import a BOM from a spreadsheet: { rows, mode: "replace" | "merge", createMissing, dryRun }
router.post("/:id/bom/import", handle(async (req, res) => {
    res.json(await svc.importBom(productId(req), req.body));
}));

module.exports = router;

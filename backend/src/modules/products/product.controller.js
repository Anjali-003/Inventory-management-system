const svc = require("./product.service");

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

async function list(req, res) {
    try {
        res.json(await svc.listProducts());
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch products"
        });
    }
}

// Default SKU offered in the "Add product" form.
const nextSku = handle(async (req, res) => {
    res.json({ sku: await svc.nextProductSku() });
});

// Add one product by hand: { sku?, name, description? }  (blank SKU -> next PRD-###)
const create = handle(async (req, res) => {
    res.status(201).json(await svc.createProduct(req.body));
});

// Add many products from a spreadsheet the browser has read: { rows: [{ line, sku, name, description }], dryRun }
const importMany = handle(async (req, res) => {
    res.json(await svc.importProducts({ rows: req.body && req.body.rows, dryRun: !!(req.body && req.body.dryRun) }));
});

async function getOne(req, res) {
    try {
        const product = await svc.getProductById(Number(req.params.id));

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        res.json(product);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch product"
        });
    }
}

async function getBom(req, res) {
    try {
        // A product with no BOM yet is not an error: this returns an empty list.
        res.json(await svc.fetchBom(Number(req.params.id)));
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch BOM"
        });
    }
}

// Replace the whole BOM from the editor: { lines: [{ component_id | newComponent, quantity_required, location }] }
const saveBom = handle(async (req, res) => {
    res.json(await svc.saveBom(productId(req), req.body));
});

// Import a BOM from a spreadsheet: { rows, mode: "replace" | "merge", createMissing, dryRun }
const importBom = handle(async (req, res) => {
    res.json(await svc.importBom(productId(req), req.body));
});

module.exports = { list, nextSku, create, importMany, getOne, getBom, saveBom, importBom };

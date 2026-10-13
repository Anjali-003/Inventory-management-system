const svc = require("./product.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");

const productId = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new AppError(404, "Product not found", "NOT_FOUND");
    return id;
};

const handle = (fn, message = "Product operation failed") => asyncHandler(fn, { message });

const list = handle(async (req, res) => {
    res.json(await svc.listProducts());
}, "Failed to fetch products");

// Default SKU offered in the "Add product" form.
const nextSku = handle(async (req, res) => {
    res.json({ sku: await svc.nextProductSku() });
});

// Add one product by hand: { sku?, name, description? }  (blank SKU -> next PRD-###)
const create = handle(async (req, res) => {
    res.status(201).json(await svc.createProduct(req.body, req.user.id));
});

// Add many products from a spreadsheet the browser has read: { rows: [{ line, sku, name, description }], dryRun }
const importMany = handle(async (req, res) => {
    res.json(await svc.importProducts({ rows: req.body && req.body.rows, dryRun: !!(req.body && req.body.dryRun), userId: req.user.id }));
});

const getOne = handle(async (req, res) => {
    const product = await svc.getProductById(Number(req.params.id));
    if (!product) throw AppError.notFound("Product not found");

    res.json(product);
}, "Failed to fetch product");

// A product with no BOM yet is not an error: this returns an empty list.
const getBom = handle(async (req, res) => {
    res.json(await svc.fetchBom(Number(req.params.id)));
}, "Failed to fetch BOM");

// Replace the whole BOM from the editor: { lines: [{ component_id | newComponent, quantity_required, location }] }
const saveBom = handle(async (req, res) => {
    res.json(await svc.saveBom(productId(req), req.body));
});

// Import a BOM from a spreadsheet: { rows, mode: "replace" | "merge", createMissing, dryRun }
const importBom = handle(async (req, res) => {
    res.json(await svc.importBom(productId(req), req.body));
});

module.exports = { list, nextSku, create, importMany, getOne, getBom, saveBom, importBom };

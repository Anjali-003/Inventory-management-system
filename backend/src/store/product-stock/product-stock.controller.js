const service = require("./product-stock.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
    res.json(await service.listStock());
}

async function movements(req, res) {
    const productId = req.query.product_id ? parseId(req.query.product_id, "product ID") : null;
    res.json(await service.listMovements({ productId }));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to load product stock" }),
    movements: asyncHandler(movements, { message: "Failed to load product stock movements" }),
};

const service = require("./incoming-stock.service");
const purchases = require("../purchase/purchase.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
    res.json(await service.list());
}

async function getOne(req, res) {
    res.json(await purchases.getPurchase(parseId(req.params.id, "purchase ID")));
}

async function accept(req, res) {
    res.json(await service.accept(parseId(req.params.id, "purchase ID"), req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch incoming stock" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch the purchase" }),
    accept: asyncHandler(accept, { message: "Failed to accept the stock" }),
};

const service = require("./customer.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
    res.json(await service.list());
}

async function create(req, res) {
    res.status(201).json(await service.create(req.body || {}, req.user.id));
}

async function update(req, res) {
    res.json(await service.update(parseId(req.params.id, "customer ID"), req.body || {}));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to load customers" }),
    create: asyncHandler(create, { message: "Failed to save the customer" }),
    update: asyncHandler(update, { message: "Failed to update the customer" }),
};

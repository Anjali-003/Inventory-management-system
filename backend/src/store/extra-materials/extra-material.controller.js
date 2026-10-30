const service = require("./extra-material.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

const idOf = (req) => parseId(req.params.id, "extra material request ID");

async function list(req, res) {
    res.json(await service.list());
}

async function options(req, res) {
    res.json(await service.options());
}

async function create(req, res) {
    res.status(201).json(await service.create(req.body || {}, req.user.id));
}

async function issue(req, res) {
    res.json(await service.decide(idOf(req), "issue", req.body || {}, req.user.id));
}

async function reject(req, res) {
    res.json(await service.decide(idOf(req), "reject", req.body || {}, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to load extra material requests" }),
    options: asyncHandler(options, { message: "Failed to load orders in production" }),
    create: asyncHandler(create, { message: "Failed to ask for extra material" }),
    issue: asyncHandler(issue, { message: "Failed to issue extra material" }),
    reject: asyncHandler(reject, { message: "Failed to reject extra material" }),
};

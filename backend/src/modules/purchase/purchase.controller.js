const service = require("./purchase.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
    const statuses = String(req.query.status || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    res.json(await service.listPurchases({ statuses }));
}

async function getOne(req, res) {
    res.json(await service.getPurchase(parseId(req.params.id, "purchase ID")));
}

async function receive(req, res) {
    res.json(await service.markReceived(parseId(req.params.id, "purchase ID"), req.user.id));
}

async function sendToIqc(req, res) {
    res.json(await service.sendToIqc(parseId(req.params.id, "purchase ID"), req.user.id));
}

async function create(req, res) {
    res.status(201).json(await service.createPurchase(req.body, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch purchases" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch the purchase" }),
    create: asyncHandler(create, { message: "Failed to save the purchase" }),
    receive: asyncHandler(receive, { message: "Failed to mark the purchase as received" }),
    sendToIqc: asyncHandler(sendToIqc, { message: "Failed to send the purchase to IQC" }),
};

const service = require("./marketing-order.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

const idOf = (req) => parseId(req.params.id, "order ID");

module.exports = {
    list: asyncHandler(async (req, res) => res.json(await service.listOrders()), { message: "Failed to fetch orders" }),
    products: asyncHandler(async (req, res) => res.json(await service.productOptions()), { message: "Failed to fetch products" }),
    customers: asyncHandler(async (req, res) => res.json(await service.customerOptions()), { message: "Failed to fetch customers" }),
    create: asyncHandler(async (req, res) => res.status(201).json(await service.createDraft(req.body, req.user.id)), { message: "Failed to save the order" }),
    send: asyncHandler(async (req, res) => res.json(await service.send(idOf(req), req.user.id)), { message: "Failed to send the order" }),
    acceptRevision: asyncHandler(async (req, res) => res.json(await service.acceptRevision(idOf(req), req.user.id)), { message: "Failed to accept the revised quantity" }),
    declineRevision: asyncHandler(async (req, res) => res.json(await service.declineRevision(idOf(req), req.user.id)), { message: "Failed to cancel the order" }),
    remove: asyncHandler(async (req, res) => res.json(await service.removeDraft(idOf(req))), { message: "Failed to delete the order" }),
};

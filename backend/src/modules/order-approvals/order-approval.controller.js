const service = require("./order-approval.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

const idOf = (req) => parseId(req.params.id, "order ID");
const statusesOf = (req) =>
    String(req.query.status || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

/* GET /order-approvals?status=PENDING_APPROVAL,APPROVED  (Operations Admin: every order) */
async function list(req, res) {
    res.json(await service.listOrders({ statuses: statusesOf(req) }));
}

/* GET /approved-orders  (Purchase Manager: only what the Operations Admin approved) */
async function listApproved(req, res) {
    res.json(await service.listOrders({ statuses: ["APPROVED"] }));
}

async function getOne(req, res) {
    const order = await service.getOrder(idOf(req));
    // a marketing draft is private to marketing until it is sent
    if (order.approval_status === "DRAFT") throw AppError.notFound("Order not found", "NOT_FOUND");
    res.json(order);
}

/*
    approve and send-to-production need an idempotency key (see shared/idempotency.js). It may arrive as the
    standard `Idempotency-Key` header or as `idempotency_key` in the body, like the inventory API. When the request was
    already applied the original response is returned and `Idempotent-Replayed: true` is set.
*/
const guardedBody = (req) => ({ ...req.body, idempotency_key: req.get("Idempotency-Key") || (req.body && req.body.idempotency_key) });
const replayFlag = (res) => ({ onReplay: () => res.set("Idempotent-Replayed", "true") });

async function approve(req, res) {
    res.json(await service.approve(idOf(req), guardedBody(req), req.user.id, replayFlag(res)));
}

async function reject(req, res) {
    res.json(await service.reject(idOf(req), req.body, req.user.id));
}

/* POST /order-approvals/:id/cancel: an approved order that has not started production; its stock comes back */
async function cancel(req, res) {
    res.json(await service.cancel(idOf(req), req.body, req.user.id));
}

/* POST /order-approvals/:id/revise: make only part of the order now; the rest goes back to Marketing as a draft */
async function revise(req, res) {
    res.json(await service.revise(idOf(req), req.body, req.user.id));
}

/* GET /order-approvals/:id/plan: what can be built from the stock right now + the components that are short */
async function plan(req, res) {
    res.json(await service.getPlan(idOf(req)));
}

/* POST /order-approvals/:id/send-to-production (deducts stock) and /send-to-purchase (the components that are short) */
async function updateDeliveryDate(req, res) {
    res.json(await service.updateDeliveryDate(idOf(req), req.body, req.user));
}

async function sendToProduction(req, res) {
    res.json(await service.sendToProduction(idOf(req), guardedBody(req), req.user.id, replayFlag(res)));
}

async function sendToPurchase(req, res) {
    res.json(await service.sendToPurchase(idOf(req), req.body, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch orders" }),
    listApproved: asyncHandler(listApproved, { message: "Failed to fetch approved orders" }),
    cancel: asyncHandler(cancel, { message: "Failed to cancel the order" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch the order" }),
    approve: asyncHandler(approve, { message: "Failed to approve the order" }),
    reject: asyncHandler(reject, { message: "Failed to reject the order" }),
    revise: asyncHandler(revise, { message: "Failed to revise the order quantity" }),
    plan: asyncHandler(plan, { message: "Failed to check the stock for this order" }),
    sendToProduction: asyncHandler(sendToProduction, { message: "Failed to send to Production" }),
    sendToPurchase: asyncHandler(sendToPurchase, { message: "Failed to send the list to Purchase" }),
    updateDeliveryDate: asyncHandler(updateDeliveryDate, { message: "Failed to update delivery date" }),
};

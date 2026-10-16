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

async function approve(req, res) {
    res.json(await service.approve(idOf(req), req.body, req.user.id));
}

async function reject(req, res) {
    res.json(await service.reject(idOf(req), req.body, req.user.id));
}

/* GET /order-approvals/:id/plan: what can be built from the stock right now + the components that are short */
async function plan(req, res) {
    res.json(await service.getPlan(idOf(req)));
}

/* POST /order-approvals/:id/dispatch: approve + send the producible list (Production) and the shortage list (Purchase) */
async function dispatch(req, res) {
    res.json(await service.dispatch(idOf(req), req.body, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch orders" }),
    listApproved: asyncHandler(listApproved, { message: "Failed to fetch approved orders" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch the order" }),
    approve: asyncHandler(approve, { message: "Failed to approve the order" }),
    reject: asyncHandler(reject, { message: "Failed to reject the order" }),
    plan: asyncHandler(plan, { message: "Failed to check the stock for this order" }),
    dispatch: asyncHandler(dispatch, { message: "Failed to send the order" }),
};

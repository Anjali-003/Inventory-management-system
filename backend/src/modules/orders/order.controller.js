const orderService = require("./order.service");
const { checkMaterialAvailability } = require("./material-requirement.service");
const { startProduction, getProductionInfo, checkProductionMaterials } = require("../production/production.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId, parsePositiveInt } = require("../../shared/validators");

const orderIdOf = (req) => parseId(req.params.id, "order ID");

/* GET ALL ORDERS */
async function list(req, res) {
    res.json(await orderService.listOrders());
}

/* GET SINGLE ORDER */
async function getOne(req, res) {
    const order = await orderService.getOrderById(orderIdOf(req));
    if (!order) throw AppError.notFound("Order not found");

    res.json(order);
}

/*
    UPDATE ORDER STATUS

    PATCH /api/v1/orders/:id/status
    Body: { "status": "TESTING" }
    Allowed: see ORDER_STATUSES in order.service.js
*/
async function updateStatus(req, res) {
    const orderId = orderIdOf(req);
    const status = String(req.body?.status || "").trim().toUpperCase();

    if (!orderService.ORDER_STATUSES.includes(status)) {
        throw new AppError(400, "Invalid order status", undefined, { allowedStatuses: orderService.ORDER_STATUSES });
    }

    const result = await orderService.updateOrderStatus(orderId, status);
    if (!result) throw AppError.notFound("Order not found");

    res.status(200).json({
        message: "Order status updated successfully",
        orderId,
        orderNumber: result.orderNumber,
        previousStatus: result.previousStatus,
        status,
    });
}

/* CREATE ORDER */
async function create(req, res) {
    const { items } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw AppError.badRequest("Order must contain at least one item");
    }

    for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
            throw AppError.badRequest("Each item needs a valid productId and quantity");
        }
    }

    // req.user is set by authMiddleware + resolveUser (see order.routes.js)
    const order = await orderService.createOrder(items, req.user.id);

    res.status(201).json({ message: "Order created successfully", ...order });
}

/*
    CHECK FULL ORDER MATERIAL AVAILABILITY
    Checks the complete order quantity.
*/
async function materialCheck(req, res) {
    res.json(await checkMaterialAvailability(orderIdOf(req)));
}

/*
    GET PARTIAL PRODUCTION INFORMATION

    GET /api/v1/orders/:orderItemId/production-info (parameter is an order_items.id)
    Returns: ordered, started, completed, in production,
    remaining to start, maximum from inventory.
*/
async function productionInfo(req, res) {
    const orderItemId = orderIdOf(req);
    res.json(await getProductionInfo(orderItemId));
}

/*
    CHECK MATERIALS FOR PARTIAL QUANTITY

    GET /api/v1/orders/:orderItemId/production-check?quantity=20
*/
async function productionCheck(req, res) {
    const orderItemId = orderIdOf(req);
    const quantity = parsePositiveInt(req.query.quantity, "Quantity must be a positive integer");

    res.json(await checkProductionMaterials(orderItemId, quantity));
}

/*
    START PARTIAL PRODUCTION

    POST /api/v1/orders/:orderItemId/start-production
    Body: { "quantity": 20 }
*/
async function startPartialProduction(req, res) {
    const orderItemId = orderIdOf(req);
    const quantity = parsePositiveInt(req.body?.quantity, "Production quantity must be a positive integer");

    // Resolve approval through the parent marketing order for this product line.
    const approval = await orderService.getApprovalStatusForOrderItem(orderItemId);
    if (approval === null) throw AppError.notFound("Order not found");
    if (approval !== "APPROVED") {
        throw AppError.conflict(
            approval === "REJECTED"
                ? "This order was rejected by the Operations Admin, so production cannot start."
                : approval === "DRAFT"
                    ? "This order is still a draft with the Marketing Manager. It has not been sent for approval yet."
                    : "This order is waiting for Operations Admin approval. Production can start once it is approved.",
            "NOT_APPROVED"
        );
    }

    // req.user is set by authMiddleware + resolveUser (see order.routes.js)
    const result = await startProduction(orderItemId, quantity, req.user.id);

    // Material shortage: a normal answer (the dialog shows what is missing), not an exception
    if (!result.success) return res.status(409).json(result);

    res.status(200).json(result);
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch orders" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch order" }),
    updateStatus: asyncHandler(updateStatus, { message: "Failed to update order status" }),
    create: asyncHandler(create, { message: "Failed to create order" }),
    materialCheck: asyncHandler(materialCheck, { message: "Failed to check material availability" }),
    productionInfo: asyncHandler(productionInfo, { message: "Failed to get production information" }),
    productionCheck: asyncHandler(productionCheck, { message: "Failed to check partial production materials" }),
    startPartialProduction: asyncHandler(startPartialProduction, { message: "Failed to start production" }),
};

const orderService = require("./order.service");
const { checkMaterialAvailability } = require("./material-requirement.service");
const { startProduction, getProductionInfo, checkProductionMaterials } = require("../production/production.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId, parsePositiveInt } = require("../../shared/validators");

const orderIdOf = (req) => parseId(req.params.id, "order ID");
// optional: an order with one product does not need to name it; an order with several products must
const productIdOf = (raw) => (raw === undefined || raw === null || raw === "" ? undefined : parseId(raw, "product ID"));

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

    GET /api/v1/orders/15/production-info
    Returns: ordered, started, completed, in production,
    remaining to start, maximum from inventory.
*/
async function productionInfo(req, res) {
    res.json(await getProductionInfo(orderIdOf(req), productIdOf(req.query.product_id)));
}

/*
    CHECK MATERIALS FOR PARTIAL QUANTITY

    GET /api/v1/orders/15/production-check?quantity=20
*/
async function productionCheck(req, res) {
    const orderId = orderIdOf(req);
    const quantity = parsePositiveInt(req.query.quantity, "Quantity must be a positive integer");

    res.json(await checkProductionMaterials(orderId, quantity, productIdOf(req.query.product_id)));
}

/*
    START PARTIAL PRODUCTION

    POST /api/v1/orders/:id/start-production
    Body: { "quantity": 20, "product_id": 3 }   (product_id is optional when the order has one product)
*/
async function startPartialProduction(req, res) {
    const orderId = orderIdOf(req);
    const quantity = parsePositiveInt(req.body?.quantity, "Production quantity must be a positive integer");

    // production starts only after the Operations Admin has approved the order
    const approval = await orderService.getApprovalStatus(orderId);
    if (approval === null) throw AppError.notFound("Order not found");
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(approval)) {
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
    const result = await startProduction(orderId, quantity, req.user.id, productIdOf(req.body?.product_id));

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

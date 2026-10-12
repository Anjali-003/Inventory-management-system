const orderService = require("./order.service");
const { checkMaterialAvailability } = require("./material-requirement.service");
const {
    startProduction,
    getProductionInfo,
    checkProductionMaterials
} = require("../production/production.service");

const NO_BOM = "Order has no products or BOM data";
const ONE_PRODUCT_ONLY = "Partial production currently supports one product per order";

const isPositiveInt = (n) => Number.isInteger(n) && n > 0;
const invalidOrderId = (res) => res.status(400).json({ message: "Invalid order ID" });


/* GET ALL ORDERS */
async function list(req, res) {
    try {
        res.json(await orderService.listOrders());
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch orders"
        });
    }
}


/* GET SINGLE ORDER */
async function getOne(req, res) {
    try {
        const orderId = Number(req.params.id);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        const order = await orderService.getOrderById(orderId);

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        res.json(order);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch order"
        });
    }
}


/*
    UPDATE ORDER STATUS

    PATCH /api/orders/:id/status
    Body: { "status": "TESTING" }
    Allowed: see ORDER_STATUSES in order.service.js
*/
async function updateStatus(req, res) {
    try {
        const orderId = Number(req.params.id);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        const status = String(req.body?.status || "").trim().toUpperCase();

        if (!orderService.ORDER_STATUSES.includes(status)) {
            return res.status(400).json({
                message: "Invalid order status",
                allowedStatuses: orderService.ORDER_STATUSES
            });
        }

        const result = await orderService.updateOrderStatus(orderId, status);

        if (!result) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        res.status(200).json({
            message: "Order status updated successfully",
            orderId,
            orderNumber: result.orderNumber,
            previousStatus: result.previousStatus,
            status
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to update order status"
        });
    }
}


/* CREATE ORDER */
async function create(req, res) {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                message: "Order must contain at least one item"
            });
        }

        for (const item of items) {
            if (!item.productId || !item.quantity || item.quantity <= 0) {
                return res.status(400).json({
                    message: "Each item needs a valid productId and quantity"
                });
            }
        }

        // req.user is set by authMiddleware + resolveUser (see order.routes.js)
        const order = await orderService.createOrder(items, req.user.id);

        res.status(201).json({
            message: "Order created successfully",
            ...order
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to create order"
        });
    }
}


/*
    CHECK FULL ORDER MATERIAL AVAILABILITY
    Checks the complete order quantity.
*/
async function materialCheck(req, res) {
    try {
        const orderId = Number(req.params.id);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        res.json(await checkMaterialAvailability(orderId));
    } catch (error) {
        console.error(error);

        if (error.message === "Order not found") {
            return res.status(404).json({ message: "Order not found" });
        }

        if (error.message === NO_BOM) {
            return res.status(400).json({ message: error.message });
        }

        res.status(500).json({
            message: "Failed to check material availability"
        });
    }
}


/*
    GET PARTIAL PRODUCTION INFORMATION

    GET /api/orders/15/production-info
    Returns: ordered, started, completed, in production,
    remaining to start, maximum from inventory.
*/
async function productionInfo(req, res) {
    try {
        const orderId = Number(req.params.id);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        res.json(await getProductionInfo(orderId));
    } catch (error) {
        console.error(error);

        if (error.message === "Order not found") {
            return res.status(404).json({ message: error.message });
        }

        if (error.message === NO_BOM || error.message === ONE_PRODUCT_ONLY) {
            return res.status(400).json({ message: error.message });
        }

        res.status(500).json({
            message: "Failed to get production information"
        });
    }
}


/*
    CHECK MATERIALS FOR PARTIAL QUANTITY

    GET /api/orders/15/production-check?quantity=20
*/
async function productionCheck(req, res) {
    try {
        const orderId = Number(req.params.id);
        const quantity = Number(req.query.quantity);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        if (!isPositiveInt(quantity)) {
            return res.status(400).json({
                message: "Quantity must be a positive integer"
            });
        }

        res.json(await checkProductionMaterials(orderId, quantity));
    } catch (error) {
        console.error(error);

        if (error.message === "Order not found") {
            return res.status(404).json({ message: error.message });
        }

        // Requested quantity too high
        if (error.message.startsWith("Requested quantity exceeds")) {
            return res.status(409).json({ message: error.message });
        }

        // Product / BOM errors
        if (error.message === NO_BOM || error.message === ONE_PRODUCT_ONLY) {
            return res.status(400).json({ message: error.message });
        }

        res.status(500).json({
            message: "Failed to check partial production materials"
        });
    }
}


/*
    START PARTIAL PRODUCTION

    POST /api/orders/:id/start-production
    Body: { "quantity": 20 }
*/
async function startPartialProduction(req, res) {
    try {
        const orderId = Number(req.params.id);

        if (!isPositiveInt(orderId)) return invalidOrderId(res);

        const quantity = Number(req.body?.quantity);

        if (!isPositiveInt(quantity)) {
            return res.status(400).json({
                message: "Production quantity must be a positive integer"
            });
        }

        // req.user is set by authMiddleware + resolveUser (see order.routes.js)
        const result = await startProduction(orderId, quantity, req.user.id);

        // Material shortage
        if (!result.success) {
            return res.status(409).json(result);
        }

        res.status(200).json(result);
    } catch (error) {
        console.error(error);

        if (error.message === "Order not found") {
            return res.status(404).json({ message: error.message });
        }

        // Conflicts
        if (
            error.message === "Order is already completed" ||
            error.message.startsWith("Requested quantity exceeds")
        ) {
            return res.status(409).json({ message: error.message });
        }

        // Product / BOM errors
        if (error.message === NO_BOM || error.message === ONE_PRODUCT_ONLY) {
            return res.status(400).json({ message: error.message });
        }

        res.status(500).json({
            message: "Failed to start production"
        });
    }
}

module.exports = {
    list,
    getOne,
    updateStatus,
    create,
    materialCheck,
    productionInfo,
    productionCheck,
    startPartialProduction
};

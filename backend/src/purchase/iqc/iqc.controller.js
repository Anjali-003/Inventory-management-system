const service = require("./iqc.service");
const purchases = require("../purchase-orders/purchase-order.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

// ?status=PENDING_IQC,PENDING_STORE  (default: every purchase that was sent to IQC, newest first;
// ORDER_PLACED / RECEIVED purchases are still with the purchase manager and never show here)
async function list(req, res) {
    const asked = String(req.query.status || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const statuses = asked.filter((s) => purchases.IQC_VISIBLE.includes(s));
    res.json(await purchases.listPurchases({ statuses: statuses.length ? statuses : purchases.IQC_VISIBLE }));
}

async function getOne(req, res) {
    res.json(await purchases.getPurchase(parseId(req.params.id, "purchase ID")));
}

async function inspect(req, res) {
    res.json(await service.inspect(parseId(req.params.id, "purchase ID"), req.body, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch the IQC queue" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch the purchase" }),
    inspect: asyncHandler(inspect, { message: "Failed to save the inspection" }),
};

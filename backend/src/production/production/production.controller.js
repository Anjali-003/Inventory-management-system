const service = require("./production.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId, parsePositiveInt } = require("../../shared/validators");

async function list(req, res) {
    res.json(await service.getProductionOrders());
}

async function updateProgress(req, res) {
    const id = parseId(req.params.id, "production ID");
    const quantity = parsePositiveInt(req.body?.quantity, "Quantity must be a positive integer");

    res.json(await service.updateProductionProgress(id, quantity, req.user.id));
}

async function complete(req, res) {
    const id = parseId(req.params.id, "production ID");

    res.json(await service.completeProduction(id, req.user.id));
}

async function startRework(req, res) {
    const id = parseId(req.params.id, "Production ID");
    res.json(await service.startQualityControlRework(id, req.user.id));
}

async function submitRework(req, res) {
    const id = parseId(req.params.id, "Production ID");
    const remarks = typeof req.body?.remarks === "string" ? req.body.remarks : "";
    res.json(await service.submitQualityControlRework(id, remarks, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch production orders" }),
    updateProgress: asyncHandler(updateProgress, { message: "Failed to update production" }),
    complete: asyncHandler(complete, { message: "Failed to complete production" }),
    startRework: asyncHandler(startRework, { message: "Failed to start quality control rework" }),
    submitRework: asyncHandler(submitRework, { message: "Failed to submit rework to Quality Control" }),
};

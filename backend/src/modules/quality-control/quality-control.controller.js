const service = require("./quality-control.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId, parsePositiveInt, parseNonNegativeInt } = require("../../shared/validators");

const productionIdOf = (req) => parseId(req.params.productionId, "production ID");

async function list(req, res) {
    res.json(await service.getQualityControlOrders());
}

async function getOne(req, res) {
    res.json(await service.getQualityControlInfo(productionIdOf(req)));
}

async function saveTesting(req, res) {
    const id = productionIdOf(req);
    const quantity = parsePositiveInt(req.body?.quantity, "Testing quantity must be a positive integer");

    res.status(201).json(
        await service.saveTestingResult(id, quantity, req.body?.overallResult, req.body?.remarks, req.user.id)
    );
}

async function redoTestingResult(req, res) {
    const id = productionIdOf(req);
    const redoPassed = parseNonNegativeInt(req.body?.redoPassed, "Redo passed quantity must be a non-negative integer");

    res.json(await service.redoTesting(id, redoPassed, req.user.id));
}

async function redoQcResult(req, res) {
    const id = productionIdOf(req);
    const redoApproved = parseNonNegativeInt(req.body?.redoApproved, "Redo approved quantity must be a non-negative integer");

    res.json(await service.redoQualityControl(id, redoApproved, req.user.id));
}

async function saveQc(req, res) {
    const id = productionIdOf(req);
    const quantity = parsePositiveInt(req.body?.quantity, "QC quantity must be a positive integer");

    res.status(201).json(
        await service.saveQualityControlResult(id, quantity, req.body?.overallResult, req.body?.remarks, req.user.id)
    );
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch quality control orders" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch quality control information" }),
    saveTesting: asyncHandler(saveTesting, { message: "Failed to save testing result" }),
    redoTestingResult: asyncHandler(redoTestingResult, { message: "Failed to save redo testing result" }),
    redoQcResult: asyncHandler(redoQcResult, { message: "Failed to save QC edit result" }),
    saveQc: asyncHandler(saveQc, { message: "Failed to save quality control result" }),
};

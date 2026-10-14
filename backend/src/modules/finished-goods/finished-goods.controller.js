const service = require("./finished-goods.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

const idOf = (req) => parseId(req.params.id, "finished goods ID");

async function list(req, res) {
    res.json(await service.getFinishedGoods());
}

async function getOne(req, res) {
    res.json(await service.getFinishedGood(idOf(req)));
}

async function dispatch(req, res) {
    res.json(await service.markDispatched(idOf(req), req.user.id));
}

async function complete(req, res) {
    res.json(await service.markCompleted(idOf(req), req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch finished goods" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch finished goods record" }),
    dispatch: asyncHandler(dispatch, { message: "Failed to mark finished goods as dispatched" }),
    complete: asyncHandler(complete, { message: "Failed to mark finished goods as completed" }),
};

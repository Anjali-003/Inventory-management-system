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

async function getBill(req, res) {
    res.json(await service.getBill(idOf(req)));
}

async function createBill(req, res) {
    res.status(201).json(await service.createBill(idOf(req), req.body || {}, req.user.id));
}

const withBody = (name, message) =>
    asyncHandler(async (req, res) => {
        res.status(201).json(await service[name](idOf(req), req.body || {}, req.user.id));
    }, { message });

/* receive / dispatch */
const step = (name) =>
    asyncHandler(async (req, res) => {
        res.json(await service.advance(name, idOf(req), req.body || {}, req.user.id));
    }, { message: "Failed to update finished goods" });

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch finished goods" }),
    getOne: asyncHandler(getOne, { message: "Failed to fetch finished goods record" }),
    getBill: asyncHandler(getBill, { message: "Failed to fetch the bill" }),
    createBill: asyncHandler(createBill, { message: "Failed to create the bill" }),
    step,
    addPayment: withBody("addPayment", "Failed to record the payment"),
    cancelBill: withBody("cancelBill", "Failed to cancel the bill"),
    addCreditNote: withBody("addCreditNote", "Failed to make the credit note"),
};

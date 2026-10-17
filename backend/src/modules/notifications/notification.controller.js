const service = require("./notification.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
    res.json(await service.list(req.user.role));
}

async function markDone(req, res) {
    res.json(await service.markDone(parseId(req.params.id, "notification ID"), req.user.role, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch notifications" }),
    markDone: asyncHandler(markDone, { message: "Failed to update the notification" }),
};

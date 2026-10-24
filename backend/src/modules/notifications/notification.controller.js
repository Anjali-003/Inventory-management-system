const service = require("./notification.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

// every call works on the inbox of the role this tab is logged in as (req.user.role)
async function list(req, res) {
    res.json(await service.list(req.user.role, req.user.userId));
}

async function markRead(req, res) {
    res.json(await service.markRead(parseId(req.params.id, "notification ID"), req.user.role, req.user.id));
}

async function markAllRead(req, res) {
    res.json(await service.markAllRead(req.user.role, req.user.id));
}

async function markDone(req, res) {
    res.json(await service.markDone(parseId(req.params.id, "notification ID"), req.user.role, req.user.id));
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch notifications" }),
    markRead: asyncHandler(markRead, { message: "Failed to update the notification" }),
    markAllRead: asyncHandler(markAllRead, { message: "Failed to update the notifications" }),
    markDone: asyncHandler(markDone, { message: "Failed to update the notification" }),
};

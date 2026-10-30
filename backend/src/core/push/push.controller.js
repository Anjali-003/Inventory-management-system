const service = require("./push.service");
const asyncHandler = require("../../middleware/asyncHandler");

// every call works for the role this tab is logged in as (req.user.role)
async function config(req, res) {
    res.json(service.config());
}

// ?endpoint=...  is this browser subscribed for this role?
async function status(req, res) {
    res.json(await service.status({ id: req.user.userId, role: req.user.role }, String(req.query.endpoint || "")));
}

async function subscribe(req, res) {
    res.status(201).json(await service.subscribe(req.user, req.body));
}

async function unsubscribe(req, res) {
    res.json(await service.unsubscribe(req.user, req.body));
}

module.exports = {
    config: asyncHandler(config, { message: "Failed to read the push settings" }),
    status: asyncHandler(status, { message: "Failed to read the push status" }),
    subscribe: asyncHandler(subscribe, { message: "Failed to turn on push notifications" }),
    unsubscribe: asyncHandler(unsubscribe, { message: "Failed to turn off push notifications" }),
};

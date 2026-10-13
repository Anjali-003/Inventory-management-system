const service = require("./activity.service");
const asyncHandler = require("../../middleware/asyncHandler");

async function list(req, res) {
    res.json(await service.list({ limit: req.query.limit }));
}

module.exports = {
    list: asyncHandler(list, { message: "Could not load activity" }),
};

const service = require("./component.service");
const asyncHandler = require("../../middleware/asyncHandler");

async function list(req, res) {
    res.json(await service.listComponents());
}

module.exports = {
    list: asyncHandler(list, { message: "Failed to fetch components" }),
};

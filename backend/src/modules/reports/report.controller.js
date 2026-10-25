const service = require("./report.service");
const asyncHandler = require("../../middleware/asyncHandler");

async function monthly(req, res) {
    const now = new Date();
    const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    res.json(await service.monthly(month));
}

module.exports = {
    monthly: asyncHandler(monthly, { message: "Failed to build the report" }),
};

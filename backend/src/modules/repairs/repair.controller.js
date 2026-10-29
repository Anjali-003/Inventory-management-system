const service = require("./repair.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");
const idOf = (req) => parseId(req.params.id, "repair ID");
module.exports = {
  list: asyncHandler(async (req, res) => res.json(await service.list(req.user)), { message: "Failed to fetch repair requests" }),
  products: asyncHandler(async (_req, res) => res.json(await service.productOptions()), { message: "Failed to fetch products" }),
  create: asyncHandler(async (req, res) => res.status(201).json(await service.create(req.body, req.user)), { message: "Failed to create repair request" }),
  decide: asyncHandler(async (req, res) => res.json(await service.decide(idOf(req), req.body, req.user)), { message: "Failed to review repair request" }),
  progress: asyncHandler(async (req, res) => res.json(await service.updateProgress(idOf(req), req.body, req.user)), { message: "Failed to update repair progress" }),
  inspect: asyncHandler(async (req, res) => res.json(await service.inspect(idOf(req), req.body, req.user)), { message: "Failed to save repair QC decision" }),
  dispatch: asyncHandler(async (req, res) => res.json(await service.dispatch(idOf(req), req.body, req.user)), { message: "Failed to record repair dispatch" }),
};

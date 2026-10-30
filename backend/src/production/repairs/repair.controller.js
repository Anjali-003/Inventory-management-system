const service = require("./repair.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");
const idOf = (req) => parseId(req.params.id, "repair ID");
module.exports = {
  list: asyncHandler(async (req, res) => res.json(await service.list(req.user)), { message: "Failed to fetch repair requests" }),
  products: asyncHandler(async (_req, res) => res.json(await service.productOptions()), { message: "Failed to fetch products" }),
  create: asyncHandler(async (req, res) => res.status(201).json(await service.create(req.body, req.user)), { message: "Failed to create repair request" }),
  image: asyncHandler(async (req, res) => {
    const image = await service.getImage(idOf(req));
    const safeName = String(image.file_name || "repair-picture")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120) || "repair-picture";
    res.setHeader("Content-Type", image.mime_type);
    res.setHeader("Content-Length", image.file_size);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(image.data);
  }, { message: "Failed to fetch repair picture" }),
  decide: asyncHandler(async (req, res) => res.json(await service.decide(idOf(req), req.body, req.user)), { message: "Failed to review repair request" }),
  progress: asyncHandler(async (req, res) => res.json(await service.updateProgress(idOf(req), req.body, req.user)), { message: "Failed to update repair progress" }),
  inspect: asyncHandler(async (req, res) => res.json(await service.inspect(idOf(req), req.body, req.user)), { message: "Failed to save repair QC decision" }),
  dispatch: asyncHandler(async (req, res) => res.json(await service.dispatch(idOf(req), req.body, req.user)), { message: "Failed to record repair dispatch" }),
};

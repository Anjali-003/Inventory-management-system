const service = require("./material-request.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

async function list(req, res) {
  res.json(await service.listRequests());
}

async function options(req, res) {
  res.json(await service.getOptions(parseId(req.params.orderItemId, "Order item ID")));
}

async function create(req, res) {
  res.status(201).json(await service.createRequest(req.body || {}, req.user.id));
}

async function issue(req, res) {
  res.json(await service.issueRequest(parseId(req.params.id, "Material request ID"), req.body || {}, req.user.id));
}

module.exports = {
  list: asyncHandler(list, { message: "Failed to load material requests" }),
  options: asyncHandler(options, { message: "Failed to load material request options" }),
  create: asyncHandler(create, { message: "Failed to submit material request" }),
  issue: asyncHandler(issue, { message: "Failed to allot requested materials" }),
};

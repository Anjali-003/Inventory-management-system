const express = require("express");
const service = require("./order-tracker.service");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

// read only; permit("orderTracker") is applied in routes/index.js
const router = express.Router();

router.get("/", asyncHandler(async (req, res) => res.json(await service.list()), { message: "Failed to load orders" }));
router.get("/:id", asyncHandler(async (req, res) => res.json(await service.timeline(parseId(req.params.id, "order ID"))), { message: "Failed to load the order's journey" }));

module.exports = router;

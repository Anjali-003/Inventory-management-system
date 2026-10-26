const express = require("express");
const service = require("./sales.service");
const asyncHandler = require("../../middleware/asyncHandler");

// read only; permit("sales") is applied in routes/index.js (bills are changed through /finished-goods)
const router = express.Router();

const thisMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

router.get("/bills", asyncHandler(async (req, res) => res.json(await service.listBills()), { message: "Failed to load bills" }));
router.get("/payments", asyncHandler(async (req, res) => res.json(await service.listPayments(req.query.month || thisMonth())), { message: "Failed to load payments" }));
router.get("/summary", asyncHandler(async (req, res) => res.json(await service.summary(req.query.month || thisMonth())), { message: "Failed to load sales" }));

module.exports = router;

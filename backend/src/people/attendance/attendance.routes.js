const express = require("express");
const controller = require("./attendance.controller");

const router = express.Router();

router.get("/", controller.list);
router.post("/mark", controller.mark);
router.post("/check-in", controller.checkIn);
router.post("/check-out", controller.checkOut);
router.post("/half-day", controller.halfDay);
router.post("/bulk", controller.bulk);
router.get("/summary", controller.summary);

module.exports = router;

const express = require("express");
const controller = require("./report.controller");

// read only; permit("reports") is applied in routes/index.js
const router = express.Router();

router.get("/monthly", controller.monthly);

module.exports = router;

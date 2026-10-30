const express = require("express");
const controller = require("./customer.controller");
const resolveUser = require("../../middleware/resolveUser");

// permit("customers") is applied in routes/index.js: GET = view, POST / PUT = edit (Marketing Manager)
const router = express.Router();

router.get("/", controller.list);
router.post("/", resolveUser, controller.create);
router.put("/:id", resolveUser, controller.update);

module.exports = router;

// This file is of no use right now, but for sure it will be useful in future. 
// super admin have the ability to create other users, 
// so this script can be used to create any type of user.

const express = require("express");
const controller = require("./super-admin.controller");
const requireRole = require("../../middleware/requireRole");

const router = express.Router();

router.use(requireRole("SUPER_ADMIN"));

router.get("/", controller.list);
router.post("/", controller.create);
router.patch("/:id", controller.update);
router.post("/:id/deactivate", controller.deactivate);
router.post("/:id/activate", controller.activate);

module.exports = router;

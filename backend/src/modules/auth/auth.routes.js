const express = require("express");
const controller = require("./auth.controller");
const { LOGIN_ROUTES } = require("../../middleware/permissions");

const router = express.Router();

// one login endpoint per role: POST /api/auth/login (super admin), /api/auth/store-manager/login ...
Object.entries(LOGIN_ROUTES).forEach(([role, path]) => {
    router.post(path, (req, res, next) => { req.loginRole = role; next(); }, controller.login);
});
router.get("/me", controller.me);
router.get("/sessions", controller.sessions);
router.post("/logout", controller.logout);

module.exports = router;

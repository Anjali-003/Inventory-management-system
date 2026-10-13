const service = require("./auth.service");
const AppError = require("../../shared/AppError");
const activity = require("../activity/activity.service");
const asyncHandler = require("../../middleware/asyncHandler");
const env = require("../../config/env");

/*
    The JWT lives in an HttpOnly cookie.
    React cannot read it directly, the browser sends it automatically with API requests.
*/
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: "lax",
};

/* LOGIN (req.loginRole is set by auth.routes.js: each role has its own endpoint) */
async function login(req, res) {
    const { email, password } = req.body || {};

    if (!email || !password) {
        throw AppError.badRequest("Email and password are required");
    }

    const { token, user } = await service.login(email, password, req.loginRole);

    res.cookie(env.cookie.name, token, { ...COOKIE_OPTIONS, maxAge: env.cookie.maxAgeMs });

    // other super admins see "X logged in" (not awaited: never delays or fails the login)
    activity.log({
        userId: user.id,
        userName: user.name,
        resource: "auth",
        action: "login",
        summary: "Logged in",
    });

    res.json({ message: "Login successful", user });
}

/* CHECK CURRENT LOGIN */
async function me(req, res) {
    const user = await service.getCurrentUser(req.cookies[env.cookie.name]);
    res.json({ user });
}

/* LOGOUT */
function logout(req, res) {
    res.clearCookie(env.cookie.name, COOKIE_OPTIONS);
    res.json({ message: "Logout successful" });
}

module.exports = {
    login: asyncHandler(login, { message: "Login failed" }),
    me: asyncHandler(me, { message: "Could not check the login" }),
    logout: asyncHandler(logout),
};

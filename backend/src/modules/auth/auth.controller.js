const service = require("./auth.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");
const env = require("../../config/env");
const { cookieNameFor, roleFromRequest } = require("../../shared/session");
const { ROLE_NAMES } = require("../../middleware/permissions");

/*
    The JWT lives in an HttpOnly cookie, one cookie per role (see shared/session.js), so every role can be
    logged in at the same time in one browser. React cannot read the cookie, the browser sends it automatically.
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

    res.cookie(cookieNameFor(user.role), token, { ...COOKIE_OPTIONS, maxAge: env.cookie.maxAgeMs });

    // logins are not written to the activity feed: it only records real work (orders, stock, approvals ...)
    res.json({ message: "Login successful", user });
}

/* CHECK CURRENT LOGIN */
async function me(req, res) {
    const role = roleFromRequest(req);
    if (!role) throw AppError.unauthorized("Not authenticated");

    const user = await service.getCurrentUser(req.cookies[cookieNameFor(role)]);
    if (user.role !== role) throw AppError.unauthorized("Not authenticated");

    res.json({ user });
}

/*
    WHICH ROLES ARE LOGGED IN ON THIS BROWSER (public, used by the landing page).
    Looks at every role cookie and returns the valid ones: { sessions: [{ role, name, email }] }.
*/
async function sessions(req, res) {
    const found = await Promise.all(
        ROLE_NAMES.map(async (role) => {
            const token = req.cookies[cookieNameFor(role)];
            if (!token) return null;
            try {
                const user = await service.getCurrentUser(token);
                return user.role === role ? { role, name: user.name, email: user.email } : null;
            } catch {
                return null;
            }
        })
    );
    res.json({ sessions: found.filter(Boolean) });
}

/* LOGOUT */
function logout(req, res) {
    // only the role this tab is working as is logged out; the other roles stay logged in
    const role = roleFromRequest(req);
    if (role) res.clearCookie(cookieNameFor(role), COOKIE_OPTIONS);
    res.clearCookie(env.cookie.name, COOKIE_OPTIONS); // old single-cookie login, if this browser still has it
    res.json({ message: "Logout successful" });
}

/* CHANGE OWN PASSWORD (behind authMiddleware: req.user is the role this tab is logged in as) */
async function changePassword(req, res) {
    const body = req.body || {};
    res.json(await service.changePassword(req.user.userId, body.current_password, body.new_password));
}

module.exports = {
    changePassword: asyncHandler(changePassword, { message: "Could not change the password" }),
    login: asyncHandler(login, { message: "Login failed" }),
    me: asyncHandler(me, { message: "Could not check the login" }),
    sessions: asyncHandler(sessions, { message: "Could not check the logins" }),
    logout: asyncHandler(logout),
};

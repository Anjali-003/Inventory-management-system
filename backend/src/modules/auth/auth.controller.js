const service = require("./auth.service");
const AppError = require("../../shared/AppError");
const activity = require("../activity/activity.service");

const COOKIE_NAME = "access_token";

/*
    The JWT lives in an HttpOnly cookie.
    React cannot read it directly, the browser sends it automatically with API requests.
*/
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: false,
    sameSite: "lax"
};

/* SUPER ADMIN LOGIN */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const { token, user } = await service.login(email, password);

        res.cookie(COOKIE_NAME, token, {
            ...COOKIE_OPTIONS,
            maxAge: 24 * 60 * 60 * 1000
        });

        // other super admins see "X logged in" (not awaited: never delays or fails the login)
        activity.log({
            userId: user.id,
            userName: user.name,
            resource: "auth",
            action: "login",
            summary: "Logged in"
        });

        res.json({
            message: "Login successful",
            user
        });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.status).json({ message: error.message });
        }

        console.error(error);

        res.status(500).json({
            message: "Login failed"
        });
    }
}

/* CHECK CURRENT LOGIN */
async function me(req, res) {
    try {
        const user = await service.getCurrentUser(req.cookies.access_token);

        res.json({ user });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.status).json({ message: error.message });
        }

        console.error(error);

        return res.status(401).json({
            message: "Not authenticated"
        });
    }
}

/* LOGOUT */
function logout(req, res) {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);

    res.json({
        message: "Logout successful"
    });
}

module.exports = { login, me, logout };

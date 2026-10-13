const jwt = require("jsonwebtoken");
const db = require("../config/db");
const env = require("../config/env");
const AppError = require("../shared/AppError");

/*
    1. The JWT cookie must be valid.
    2. The user must STILL exist and be active in the DB, so deactivating a user (or changing their role)
       takes effect on their very next request, not after the token expires.

    Only a bad/expired token or an unknown user means "401 - log in again".
    A database failure is a real server error and is passed on as one (it must not look like a logout).
*/
async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies[env.cookie.name];
        if (!token) throw AppError.unauthorized("Authentication required");

        let decoded;
        try {
            decoded = jwt.verify(token, env.jwt.secret);
        } catch {
            throw AppError.unauthorized("Invalid or expired session");
        }

        const [rows] = await db.query(
            "SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1",
            [decoded.userId]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            throw AppError.unauthorized("Invalid or expired session");
        }

        req.user = { userId: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = authMiddleware;

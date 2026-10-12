const jwt = require("jsonwebtoken");
const db = require("../config/db");

/*
    1. JWT cookie must be valid.
    2. The user must STILL exist and be active in the DB, so deactivating a super admin
       (or changing their role) takes effect on their very next request, not after the token expires.
*/
async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies.access_token;

        if (!token) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [rows] = await db.query(
            "SELECT id, email, role, is_active FROM users WHERE id = ? LIMIT 1",
            [decoded.userId]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        req.user = { userId: rows[0].id, email: rows[0].email, role: rows[0].role };
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }
}

module.exports = authMiddleware;

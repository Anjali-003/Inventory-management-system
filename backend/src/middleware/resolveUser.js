const { findUserById } = require("../modules/auth/auth.service");

/*
    Use after authMiddleware on routes that WRITE data.

    authMiddleware has already checked the login cookie and put the JWT payload on
    req.user ({ userId, email, role }). Columns such as created_by / started_by / tested_by
    reference users(id), so confirm that user still exists and expose it as req.user.id / req.user.name.
*/
async function resolveUser(req, res, next) {
    try {
        const id = Number(req.user && req.user.userId);
        const user = await findUserById(id);
        if (!user) {
            return res.status(401).json({ message: "Unknown user", code: "UNKNOWN_USER" });
        }
        req.user = { ...req.user, ...user };
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not identify user", code: "SERVER_ERROR" });
    }
}

module.exports = resolveUser;

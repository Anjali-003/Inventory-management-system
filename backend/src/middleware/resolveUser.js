const { findUserById } = require("../core/auth/auth.service");
const AppError = require("../shared/AppError");
const asyncHandler = require("./asyncHandler");

/*
    Use after authMiddleware on routes that WRITE data.

    authMiddleware has already checked the login cookie and put the JWT payload on
    req.user ({ userId, email, role }). Columns such as created_by / started_by / tested_by
    reference users(id), so confirm that user still exists and expose it as req.user.id / req.user.name.
*/
const resolveUser = asyncHandler(
    async (req, res, next) => {
        const id = Number(req.user && req.user.userId);
        const user = await findUserById(id);
        if (!user) throw AppError.unauthorized("Unknown user", "UNKNOWN_USER");

        req.user = { ...req.user, ...user };
        next();
    },
    { message: "Could not identify user" }
);

module.exports = resolveUser;

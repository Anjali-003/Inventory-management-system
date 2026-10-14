const AppError = require("../shared/AppError");

/** router.use(requireRole("SUPER_ADMIN")) - only the listed roles may continue. */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(AppError.forbidden("Access denied"));
        }
        next();
    };
}

module.exports = requireRole;

const AppError = require("../shared/AppError");

/** Any request that no route answered. Mounted just before the errorHandler. */
function notFound(req, res, next) {
    next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND"));
}

module.exports = notFound;

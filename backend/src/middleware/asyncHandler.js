const { toAppError } = require("./errorHandler");

/**
 * Wraps a controller so that anything it throws (or rejects with) reaches the central
 * errorHandler. Controllers therefore contain NO try/catch.
 *
 *   router.get("/", asyncHandler(controller.list, { message: "Failed to fetch orders" }));
 *
 * options (all optional):
 *   message  what the client sees when the error is unexpected (HTTP 500). Defaults to "Internal server error".
 *   db       per-route override of MySQL error codes, e.g. { ER_DUP_ENTRY: [409, "Employee code already exists"] }
 */
function asyncHandler(handler, options = {}) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            next(toAppError(error, options));
        }
    };
}

/** Wraps every function exported by a controller module with the same options. */
function wrapController(controller, options) {
    return Object.fromEntries(
        Object.entries(controller).map(([name, fn]) => [name, asyncHandler(fn, options)])
    );
}

module.exports = asyncHandler;
module.exports.wrapController = wrapController;

const AppError = require("../shared/AppError");

/*
    MySQL errors that mean "the caller did something wrong", not "the server broke".
    [status, message, code]. A route can override any of them via asyncHandler(fn, { db: {...} }).
*/
const DB_ERROR_CODES = {
    ER_DUP_ENTRY: [409, "This record already exists"],
    ER_NO_REFERENCED_ROW_2: [400, "A related record does not exist"],
    ER_ROW_IS_REFERENCED_2: [409, "This record is used by other records and cannot be removed"],
};

/**
 * Converts anything that was thrown into an AppError.
 * Expected failures keep their status; unexpected ones become a safe 500 (the original is kept on .cause and logged).
 */
function toAppError(error, options = {}) {
    if (error instanceof AppError) return error;

    const override = options.db && options.db[error && error.code];
    const known = override || (error && DB_ERROR_CODES[error.code]);
    if (known) return new AppError(known[0], known[1], known[2]);

    // numeric out of range (DECIMAL overflow) -> the caller sent a quantity that is too large
    if (error && (error.errno === 1264 || error.errno === 1690)) {
        return new AppError(422, "Quantity is out of the allowed range", "VALIDATION");
    }

    // the append-only ledger trigger refused an UPDATE/DELETE: someone tried to rewrite history
    if (error && error.sqlState === "45000") {
        return new AppError(403, error.message, "LEDGER_IMMUTABLE");
    }

    // body-parser / express problems that carry their own 4xx (malformed JSON, payload too large)
    if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500 && error.expose) {
        const message = error.type === "entity.too.large" ? "Request body is too large" : "Invalid request";
        return new AppError(error.status, message, "BAD_REQUEST");
    }

    const wrapped = new AppError(500, options.message || "Internal server error", "SERVER_ERROR");
    wrapped.cause = error;
    return wrapped;
}

/** Express error middleware. Mounted last in app.js. Every failure leaves the API in the same JSON shape. */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    const appError = toAppError(error);

    if (appError.status >= 500) {
        console.error(`[${req.method} ${req.originalUrl}]`, appError.cause || appError);
    }

    res.status(appError.status).json({
        message: appError.message,
        ...(appError.code ? { code: appError.code } : {}),
        ...(appError.extra || {}),
    });
}

module.exports = errorHandler;
module.exports.toAppError = toAppError;

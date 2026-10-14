/**
 * The one error type for expected failures (validation, not found, conflict, bad credentials...).
 *
 * Services throw it, the central errorHandler turns it into a JSON response, so
 * neither services nor controllers ever need their own try/catch + res.status(...) blocks.
 *
 *   throw new AppError(404, "Order not found");
 *   throw new AppError(422, "Quantity is required", "VALIDATION", { field: "quantity" });
 *   throw AppError.conflict("Cannot dispatch finished goods with status DISPATCHED");
 *
 * Response body: { message, code?, ...extra }
 */
class AppError extends Error {
    /**
     * @param {number} status   HTTP status code
     * @param {string} message  safe to show to the user
     * @param {string|object} [code]  machine-readable code, e.g. "VALIDATION" (an object is treated as `extra`)
     * @param {object} [extra]  extra fields merged into the JSON body
     */
    constructor(status, message, code, extra) {
        super(message);
        this.name = "AppError";
        this.status = status;
        if (code && typeof code === "object") {
            this.extra = code;
        } else {
            this.code = code;
            this.extra = extra;
        }
    }

    static badRequest(message, code, extra) { return new AppError(400, message, code, extra); }
    static unauthorized(message, code, extra) { return new AppError(401, message, code, extra); }
    static forbidden(message, code, extra) { return new AppError(403, message, code, extra); }
    static notFound(message, code, extra) { return new AppError(404, message, code, extra); }
    static conflict(message, code, extra) { return new AppError(409, message, code, extra); }
}

module.exports = AppError;

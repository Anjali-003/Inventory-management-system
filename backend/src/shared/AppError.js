/*
    An error that carries an HTTP status.

    Services throw it for expected failures (not found, conflict, bad credentials...).
    Controllers catch it and turn it into a JSON response, so services never touch req/res.
*/
class AppError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.extra = extra;
    }
}

module.exports = AppError;

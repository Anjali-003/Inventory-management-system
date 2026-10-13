const AppError = require("./AppError");

/** Small request-input helpers shared by controllers. They throw AppError(400) so controllers need no if/return blocks. */

const isPositiveInt = (n) => Number.isInteger(n) && n > 0;
const isNonNegativeInt = (n) => Number.isInteger(n) && n >= 0;

/** parseId("12", "order ID") -> 12, otherwise throws 400 "Invalid order ID". */
function parseId(value, label = "ID") {
    const id = Number(value);
    if (!isPositiveInt(id)) throw AppError.badRequest(`Invalid ${label}`);
    return id;
}

/** Number that must be an integer > 0, otherwise throws 400 with `message`. */
function parsePositiveInt(value, message) {
    const n = Number(value);
    if (!isPositiveInt(n)) throw AppError.badRequest(message);
    return n;
}

/** Number that must be an integer >= 0, otherwise throws 400 with `message`. */
function parseNonNegativeInt(value, message) {
    const n = Number(value);
    if (!isNonNegativeInt(n)) throw AppError.badRequest(message);
    return n;
}

module.exports = { isPositiveInt, isNonNegativeInt, parseId, parsePositiveInt, parseNonNegativeInt };

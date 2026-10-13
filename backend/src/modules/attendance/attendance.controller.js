const service = require("./attendance.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];
// Statuses an operator can set directly with a button before check-in.
// PRESENT is never set by hand (it follows Check Out) and HALF_DAY only follows Check Out.
const MANUAL_STATUSES = ["ABSENT", "LEAVE"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ALREADY_MARKED = "Attendance for this employee is already marked for this date and cannot be changed";

const badRequest = (message) => new AppError(400, message);
const validEmployeeId = (id) => Number.isInteger(Number(id)) && Number(id) > 0;

/* Validates the body shared by mark / check-in / check-out / half-day. Throws AppError(400). */
function parseEntry(body) {
    const { employeeId, date, time } = body || {};
    if (!DATE_RE.test(date || "")) throw badRequest("A valid date (YYYY-MM-DD) is required");
    if (!validEmployeeId(employeeId)) throw badRequest("Invalid employee ID");
    // Optional HH:MM. Without it the server's current time is used (normal same-day flow).
    if (time !== undefined && time !== null && time !== "" && !TIME_RE.test(time)) throw badRequest("Time must be HH:MM");
    return { employeeId: Number(employeeId), date, time: time || null };
}

// MySQL errors that have a friendlier meaning for attendance (see middleware/errorHandler.js for the defaults)
const DB_ERRORS = {
    ER_DUP_ENTRY: [409, ALREADY_MARKED],
    ER_NO_REFERENCED_ROW_2: [400, "Employee does not exist"],
};
const handler = (fn, message, db = DB_ERRORS) => asyncHandler(fn, { message, db });

/* GET /api/v1/attendance?date=YYYY-MM-DD */
async function list(req, res) {
    const { date } = req.query;
    if (!DATE_RE.test(date || "")) throw badRequest("A valid date (YYYY-MM-DD) is required");

    res.json(await service.listByDate(date));
}

/*
    POST /api/attendance/mark
    { employeeId, date, status }   status: ABSENT | LEAVE
*/
async function mark(req, res) {
    const entry = parseEntry(req.body);
    const { status } = req.body;
    if (!MANUAL_STATUSES.includes(status)) {
        throw badRequest(`Status ${status} cannot be marked directly. Use Check In / Check Out / Half Day.`);
    }

    const saved = await service.markStatus(entry, status);
    res.status(201).json({ message: "Attendance marked", ...saved });
}

/* POST /api/attendance/check-in   { employeeId, date, time? } */
async function checkIn(req, res) {
    const saved = await service.checkIn(parseEntry(req.body));
    res.status(201).json({ message: "Checked in", ...saved });
}

/* POST /api/attendance/check-out   { employeeId, date, time? } */
async function checkOut(req, res) {
    const saved = await service.checkOut(parseEntry(req.body));
    res.json({ message: "Checked out", ...saved });
}

/* POST /api/attendance/half-day   { employeeId, date } */
async function halfDay(req, res) {
    const saved = await service.markHalfDay(parseEntry(req.body));
    res.json({ message: "Marked as half day", ...saved });
}

/*
    POST /api/attendance/bulk
    { date, records: [{ employeeId, status, checkIn? }] }
*/
async function bulk(req, res) {
    const { date, records } = req.body || {};

    if (!DATE_RE.test(date || "")) throw badRequest("A valid date (YYYY-MM-DD) is required");
    if (!Array.isArray(records) || records.length === 0) throw badRequest("No attendance records to save");

    for (const r of records) {
        if (!validEmployeeId(r.employeeId)) throw badRequest("Invalid employee ID");
        if (!STATUSES.includes(r.status)) throw badRequest(`Invalid status: ${r.status}`);
        if (r.checkIn && !TIME_RE.test(r.checkIn)) throw badRequest("Times must be HH:MM");
    }

    const { saved, skipped } = await service.saveBulk(date, records);
    res.json({ message: "Attendance saved", saved, skipped });
}

/* GET /api/attendance/summary?month=YYYY-MM */
async function summary(req, res) {
    const { month } = req.query;
    if (!MONTH_RE.test(month || "")) throw badRequest("A valid month (YYYY-MM) is required");

    res.json(await service.monthlySummary(month));
}

module.exports = {
    list: handler(list, "Failed to fetch attendance"),
    mark: handler(mark, "Failed to mark attendance"),
    checkIn: handler(checkIn, "Failed to check in"),
    checkOut: handler(checkOut, "Failed to check out"),
    halfDay: handler(halfDay, "Failed to mark half day"),
    bulk: handler(bulk, "Failed to save attendance", { ER_NO_REFERENCED_ROW_2: [400, "One or more employees do not exist"] }),
    summary: handler(summary, "Failed to fetch attendance summary"),
};

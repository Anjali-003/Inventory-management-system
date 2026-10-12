const service = require("./attendance.service");
const AppError = require("../../shared/AppError");

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

function handleError(res, error, fallback) {
    if (error instanceof AppError) {
        return res.status(error.status).json({ message: error.message });
    }
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: ALREADY_MARKED });
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ message: "Employee does not exist" });
    res.status(500).json({ message: fallback });
}

/* GET /api/attendance?date=YYYY-MM-DD */
async function list(req, res) {
    try {
        const { date } = req.query;
        if (!DATE_RE.test(date || "")) throw badRequest("A valid date (YYYY-MM-DD) is required");

        res.json(await service.listByDate(date));
    } catch (error) {
        handleError(res, error, "Failed to fetch attendance");
    }
}

/*
    POST /api/attendance/mark
    { employeeId, date, status }   status: ABSENT | LEAVE
*/
async function mark(req, res) {
    try {
        const entry = parseEntry(req.body);
        const { status } = req.body;
        if (!MANUAL_STATUSES.includes(status)) {
            throw badRequest(`Status ${status} cannot be marked directly. Use Check In / Check Out / Half Day.`);
        }

        const saved = await service.markStatus(entry, status);
        res.status(201).json({ message: "Attendance marked", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to mark attendance");
    }
}

/* POST /api/attendance/check-in   { employeeId, date, time? } */
async function checkIn(req, res) {
    try {
        const saved = await service.checkIn(parseEntry(req.body));
        res.status(201).json({ message: "Checked in", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to check in");
    }
}

/* POST /api/attendance/check-out   { employeeId, date, time? } */
async function checkOut(req, res) {
    try {
        const saved = await service.checkOut(parseEntry(req.body));
        res.json({ message: "Checked out", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to check out");
    }
}

/* POST /api/attendance/half-day   { employeeId, date } */
async function halfDay(req, res) {
    try {
        const saved = await service.markHalfDay(parseEntry(req.body));
        res.json({ message: "Marked as half day", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to mark half day");
    }
}

/*
    POST /api/attendance/bulk
    { date, records: [{ employeeId, status, checkIn? }] }
*/
async function bulk(req, res) {
    try {
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
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error(error);
        if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ message: "One or more employees do not exist" });
        res.status(500).json({ message: "Failed to save attendance" });
    }
}

/* GET /api/attendance/summary?month=YYYY-MM */
async function summary(req, res) {
    try {
        const { month } = req.query;
        if (!MONTH_RE.test(month || "")) throw badRequest("A valid month (YYYY-MM) is required");

        res.json(await service.monthlySummary(month));
    } catch (error) {
        handleError(res, error, "Failed to fetch attendance summary");
    }
}

module.exports = { list, mark, checkIn, checkOut, halfDay, bulk, summary };

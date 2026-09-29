const express = require("express");
const db = require("../config/db");

const router = express.Router();

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];
// Statuses an operator can set directly with a button before check-in.
// PRESENT is never set by hand (it follows Check Out) and HALF_DAY only follows Check Out.
const MANUAL_STATUSES = ["ABSENT", "LEAVE"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/*
    GET /api/attendance?date=YYYY-MM-DD
    Every active employee with that day's status.
    status is null when the employee has not been marked yet for that date, OR when they
    have checked in but not checked out yet (check_in is set, check_out is null).
    Flow: Check In -> Check Out (status becomes PRESENT) -> optionally Half Day.
    Absent / Leave are only possible before Check In.
*/
router.get("/", async (req, res) => {
    const { date } = req.query;
    if (!DATE_RE.test(date || "")) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });

    try {
        const [rows] = await db.query(
            `SELECT
                e.id AS employee_id,
                e.employee_code,
                e.name,
                e.department,
                a.status,
                TIME_FORMAT(a.check_in, '%H:%i') AS check_in,
                TIME_FORMAT(a.check_out, '%H:%i') AS check_out,
                DATE_FORMAT(a.marked_at, '%h:%i %p') AS marked_at
             FROM employees e
             LEFT JOIN attendance a
                ON a.employee_id = e.id AND a.attendance_date = ?
             WHERE e.is_active = TRUE
             ORDER BY e.name`,
            [date]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch attendance" });
    }
});

const SAVED_SQL = `SELECT status,
                TIME_FORMAT(check_in, '%H:%i') AS check_in,
                TIME_FORMAT(check_out, '%H:%i') AS check_out,
                DATE_FORMAT(marked_at, '%h:%i %p') AS marked_at
         FROM attendance WHERE employee_id = ? AND attendance_date = ?`;

const ALREADY_MARKED = "Attendance for this employee is already marked for this date and cannot be changed";

function validate(req, res) {
    const { employeeId, date, time } = req.body || {};
    if (!DATE_RE.test(date || "")) { res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" }); return null; }
    if (!Number.isInteger(Number(employeeId)) || Number(employeeId) <= 0) { res.status(400).json({ message: "Invalid employee ID" }); return null; }
    // Optional HH:MM. Without it the server's current time is used (normal same-day flow).
    if (time !== undefined && time !== null && time !== "" && !TIME_RE.test(time)) { res.status(400).json({ message: "Time must be HH:MM" }); return null; }
    return { employeeId: Number(employeeId), date, time: time || null };
}

function handleError(res, error, fallback) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: ALREADY_MARKED });
    if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ message: "Employee does not exist" });
    res.status(500).json({ message: fallback });
}

/*
    POST /api/attendance/mark
    { employeeId, date, status }   status: ABSENT | LEAVE
    Only for Absent / Leave, and only before Check In (i.e. when no row exists yet).
    One-time write: if a row already exists for this employee + date it is rejected (409).
*/
router.post("/mark", async (req, res) => {
    const v = validate(req, res);
    if (!v) return;
    const { status } = req.body;
    if (!MANUAL_STATUSES.includes(status)) {
        return res.status(400).json({ message: `Status ${status} cannot be marked directly. Use Check In / Check Out / Half Day.` });
    }

    try {
        await db.query(
            `INSERT INTO attendance (employee_id, attendance_date, status, check_in, marked_at)
             VALUES (?, ?, ?, NULL, NOW())`,
            [v.employeeId, v.date, status]
        );
        const [[saved]] = await db.query(SAVED_SQL, [v.employeeId, v.date]);
        res.status(201).json({ message: "Attendance marked", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to mark attendance");
    }
});

/*
    POST /api/attendance/check-in
    { employeeId, date, time? }
    Creates the day's row with check_in = time (HH:MM) if given, else the server's current time. Status stays NULL until Check Out.
    Rejected (409) if the employee already has any row for that date.
*/
router.post("/check-in", async (req, res) => {
    const v = validate(req, res);
    if (!v) return;

    try {
        await db.query(
            `INSERT INTO attendance (employee_id, attendance_date, status, check_in, marked_at)
             VALUES (?, ?, NULL, COALESCE(CAST(? AS TIME), TIME(NOW())), NOW())`,
            [v.employeeId, v.date, v.time]
        );
        const [[saved]] = await db.query(SAVED_SQL, [v.employeeId, v.date]);
        res.status(201).json({ message: "Checked in", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to check in");
    }
});

/*
    POST /api/attendance/check-out
    { employeeId, date, time? }
    Saves check_out = time (HH:MM) if given, else the server's current time, and sets status = PRESENT.
    The time must be later than the check-in time.
    Only valid while checked in and not yet checked out.
*/
router.post("/check-out", async (req, res) => {
    const v = validate(req, res);
    if (!v) return;

    try {
        const [result] = await db.query(
            `UPDATE attendance
                SET check_out = COALESCE(CAST(? AS TIME), TIME(NOW())), status = 'PRESENT'
              WHERE employee_id = ? AND attendance_date = ?
                AND check_in IS NOT NULL AND check_out IS NULL AND status IS NULL
                AND COALESCE(CAST(? AS TIME), TIME(NOW())) > check_in`,
            [v.time, v.employeeId, v.date, v.time]
        );
        if (result.affectedRows === 0) {
            const [[row]] = await db.query(
                "SELECT status, check_in, check_out FROM attendance WHERE employee_id = ? AND attendance_date = ?",
                [v.employeeId, v.date]
            );
            if (row && row.check_in && !row.check_out && !row.status) {
                return res.status(409).json({ message: "Check-out time must be after the check-in time" });
            }
            return res.status(409).json({ message: "Employee must be checked in (and not already checked out) to check out" });
        }
        const [[saved]] = await db.query(SAVED_SQL, [v.employeeId, v.date]);
        res.json({ message: "Checked out", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to check out");
    }
});

/*
    POST /api/attendance/half-day
    { employeeId, date }
    Manually changes PRESENT -> HALF_DAY. Only valid after Check Out.
*/
router.post("/half-day", async (req, res) => {
    const v = validate(req, res);
    if (!v) return;

    try {
        const [result] = await db.query(
            `UPDATE attendance
                SET status = 'HALF_DAY'
              WHERE employee_id = ? AND attendance_date = ?
                AND check_out IS NOT NULL AND status = 'PRESENT'`,
            [v.employeeId, v.date]
        );
        if (result.affectedRows === 0) {
            return res.status(409).json({ message: "Half Day can only be set after Check Out" });
        }
        const [[saved]] = await db.query(SAVED_SQL, [v.employeeId, v.date]);
        res.json({ message: "Marked as half day", ...saved });
    } catch (error) {
        handleError(res, error, "Failed to mark half day");
    }
});

/*
    POST /api/attendance/bulk
    { date, records: [{ employeeId, status, checkIn? }] }
    Only inserts records for employees who are NOT already marked for that date
    (used by "Mark remaining as present"). Already-marked employees are skipped,
    never overwritten, for the same reason /mark rejects duplicates.
*/
router.post("/bulk", async (req, res) => {
    const { date, records } = req.body || {};

    if (!DATE_RE.test(date || "")) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ message: "No attendance records to save" });

    for (const r of records) {
        if (!Number.isInteger(Number(r.employeeId)) || Number(r.employeeId) <= 0) return res.status(400).json({ message: "Invalid employee ID" });
        if (!STATUSES.includes(r.status)) return res.status(400).json({ message: `Invalid status: ${r.status}` });
        if (r.checkIn && !TIME_RE.test(r.checkIn)) return res.status(400).json({ message: "Times must be HH:MM" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const ids = records.map((r) => Number(r.employeeId));
        const [existingRows] = await connection.query(
            `SELECT employee_id FROM attendance WHERE attendance_date = ? AND employee_id IN (?)`,
            [date, ids]
        );
        const alreadyMarked = new Set(existingRows.map((r) => r.employee_id));

        let saved = 0;
        for (const r of records) {
            if (alreadyMarked.has(Number(r.employeeId))) continue; // never overwrite a locked day
            const worked = r.status === "PRESENT" || r.status === "HALF_DAY";
            await connection.query(
                `INSERT INTO attendance (employee_id, attendance_date, status, check_in, marked_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [Number(r.employeeId), date, r.status, worked && r.checkIn ? r.checkIn : null]
            );
            saved++;
        }

        await connection.commit();
        res.json({ message: "Attendance saved", saved, skipped: records.length - saved });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        if (error.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ message: "One or more employees do not exist" });
        res.status(500).json({ message: "Failed to save attendance" });
    } finally {
        connection.release();
    }
});

/*
    GET /api/attendance/summary?month=YYYY-MM
    Per-employee counts for the month
*/
router.get("/summary", async (req, res) => {
    const { month } = req.query;
    if (!/^\d{4}-\d{2}$/.test(month || "")) return res.status(400).json({ message: "A valid month (YYYY-MM) is required" });

    try {
        const start = `${month}-01`;
        const [rows] = await db.query(
            `SELECT
                e.id AS employee_id,
                e.employee_code,
                e.name,
                e.department,
                COALESCE(SUM(a.status = 'PRESENT'), 0) AS present,
                COALESCE(SUM(a.status = 'HALF_DAY'), 0) AS half_day,
                COALESCE(SUM(a.status = 'LEAVE'), 0) AS on_leave,
                COALESCE(SUM(a.status = 'ABSENT'), 0) AS absent
             FROM employees e
             LEFT JOIN attendance a
                ON a.employee_id = e.id
                AND a.attendance_date >= ?
                AND a.attendance_date <= LAST_DAY(?)
             WHERE e.is_active = TRUE
             GROUP BY e.id, e.employee_code, e.name, e.department
             ORDER BY e.name`,
            [start, start]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch attendance summary" });
    }
});

module.exports = router;

const express = require("express");
const db = require("../config/db");

const router = express.Router();

const STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/*
    GET /api/attendance?date=YYYY-MM-DD
    Every active employee with that day's status (status is null when not yet marked)
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
                TIME_FORMAT(a.check_out, '%H:%i') AS check_out
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

/*
    POST /api/attendance/bulk
    { date, records: [{ employeeId, status, checkIn?, checkOut? }] }
    Saves the whole day in one transaction; re-saving a day updates it.
*/
router.post("/bulk", async (req, res) => {
    const { date, records } = req.body || {};

    if (!DATE_RE.test(date || "")) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required" });
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ message: "No attendance records to save" });

    for (const r of records) {
        if (!Number.isInteger(Number(r.employeeId)) || Number(r.employeeId) <= 0) return res.status(400).json({ message: "Invalid employee ID" });
        if (!STATUSES.includes(r.status)) return res.status(400).json({ message: `Invalid status: ${r.status}` });
        if ((r.checkIn && !TIME_RE.test(r.checkIn)) || (r.checkOut && !TIME_RE.test(r.checkOut))) return res.status(400).json({ message: "Times must be HH:MM" });
        if (r.checkIn && r.checkOut && r.checkOut < r.checkIn) return res.status(400).json({ message: "Check-out cannot be earlier than check-in" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const r of records) {
            // Times only make sense when the person actually came in
            const worked = r.status === "PRESENT" || r.status === "HALF_DAY";
            await connection.query(
                `INSERT INTO attendance (employee_id, attendance_date, status, check_in, check_out)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    check_in = VALUES(check_in),
                    check_out = VALUES(check_out)`,
                [Number(r.employeeId), date, r.status, worked && r.checkIn ? r.checkIn : null, worked && r.checkOut ? r.checkOut : null]
            );
        }

        await connection.commit();
        res.json({ message: "Attendance saved", saved: records.length });
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

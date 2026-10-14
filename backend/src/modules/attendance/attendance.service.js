const db = require("../../config/db");
const AppError = require("../../shared/AppError");

const SAVED_SQL = `SELECT status,
                TIME_FORMAT(check_in, '%H:%i') AS check_in,
                TIME_FORMAT(check_out, '%H:%i') AS check_out,
                DATE_FORMAT(marked_at, '%h:%i %p') AS marked_at
         FROM attendance WHERE employee_id = ? AND attendance_date = ?`;

async function fetchSaved(employeeId, date) {
    const [[saved]] = await db.query(SAVED_SQL, [employeeId, date]);
    return saved;
}

/*
    Every active employee with that day's status.
    status is null when the employee has not been marked yet for that date, OR when they
    have checked in but not checked out yet (check_in is set, check_out is null).
    Flow: Check In -> Check Out (status becomes PRESENT) -> optionally Half Day.
    Absent / Leave are only possible before Check In.
*/
async function listByDate(date) {
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
    return rows;
}

/*
    Absent / Leave only, and only before Check In (i.e. when no row exists yet).
    One-time write: if a row already exists for this employee + date the INSERT hits
    the unique key (ER_DUP_ENTRY), which the controller reports as 409.
*/
async function markStatus({ employeeId, date }, status) {
    await db.query(
        `INSERT INTO attendance (employee_id, attendance_date, status, check_in, marked_at)
         VALUES (?, ?, ?, NULL, NOW())`,
        [employeeId, date, status]
    );
    return fetchSaved(employeeId, date);
}

/*
    Creates the day's row with check_in = time (HH:MM) if given, else the server's current time.
    Status stays NULL until Check Out.
*/
async function checkIn({ employeeId, date, time }) {
    await db.query(
        `INSERT INTO attendance (employee_id, attendance_date, status, check_in, marked_at)
         VALUES (?, ?, NULL, COALESCE(CAST(? AS TIME), TIME(NOW())), NOW())`,
        [employeeId, date, time]
    );
    return fetchSaved(employeeId, date);
}

/*
    Saves check_out = time (HH:MM) if given, else the server's current time, and sets status = PRESENT.
    The time must be later than the check-in time.
    Only valid while checked in and not yet checked out.
*/
async function checkOut({ employeeId, date, time }) {
    const [result] = await db.query(
        `UPDATE attendance
            SET check_out = COALESCE(CAST(? AS TIME), TIME(NOW())), status = 'PRESENT'
          WHERE employee_id = ? AND attendance_date = ?
            AND check_in IS NOT NULL AND check_out IS NULL AND status IS NULL
            AND COALESCE(CAST(? AS TIME), TIME(NOW())) > check_in`,
        [time, employeeId, date, time]
    );

    if (result.affectedRows === 0) {
        const [[row]] = await db.query(
            "SELECT status, check_in, check_out FROM attendance WHERE employee_id = ? AND attendance_date = ?",
            [employeeId, date]
        );
        if (row && row.check_in && !row.check_out && !row.status) {
            throw new AppError(409, "Check-out time must be after the check-in time");
        }
        throw new AppError(409, "Employee must be checked in (and not already checked out) to check out");
    }

    return fetchSaved(employeeId, date);
}

/* Manually changes PRESENT -> HALF_DAY. Only valid after Check Out. */
async function markHalfDay({ employeeId, date }) {
    const [result] = await db.query(
        `UPDATE attendance
            SET status = 'HALF_DAY'
          WHERE employee_id = ? AND attendance_date = ?
            AND check_out IS NOT NULL AND status = 'PRESENT'`,
        [employeeId, date]
    );

    if (result.affectedRows === 0) {
        throw new AppError(409, "Half Day can only be set after Check Out");
    }

    return fetchSaved(employeeId, date);
}

/*
    Only inserts records for employees who are NOT already marked for that date
    (used by "Mark remaining as present"). Already-marked employees are skipped,
    never overwritten, for the same reason markStatus rejects duplicates.
*/
async function saveBulk(date, records) {
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
        return { saved, skipped: records.length - saved };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/* Per-employee counts for the month (month = "YYYY-MM") */
async function monthlySummary(month) {
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
    return rows;
}

module.exports = { listByDate, markStatus, checkIn, checkOut, markHalfDay, saveBulk, monthlySummary };

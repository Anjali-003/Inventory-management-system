const express = require("express");
const db = require("../config/db");

const router = express.Router();

const COLUMNS = `id, employee_code, name, email, phone, department, designation,
    DATE_FORMAT(joined_on, '%Y-%m-%d') AS joined_on, is_active`;

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function validate(b) {
    if (!clean(b.name)) return "Name is required";
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return "Email is not valid";
    if (b.joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(b.joinedOn)) return "Joined date is not valid";
    return null;
}

function handleError(res, error, fallback) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Employee code or email already exists" });
    }
    res.status(500).json({ message: fallback });
}

/* GET ALL EMPLOYEES */
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT ${COLUMNS} FROM employees ORDER BY is_active DESC, name`);
        res.json(rows);
    } catch (error) {
        handleError(res, error, "Failed to fetch employees");
    }
});

/* CREATE EMPLOYEE */
router.post("/", async (req, res) => {
    const b = req.body || {};
    const problem = validate(b);
    if (problem) return res.status(400).json({ message: problem });

    try {
        let code = clean(b.employeeCode);
        if (!code) {
            const [[{ next }]] = await db.query("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM employees");
            code = `EMP-${String(next).padStart(4, "0")}`;
        }

        const [result] = await db.query(
            `INSERT INTO employees (employee_code, name, email, phone, department, designation, joined_on)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [code, clean(b.name), clean(b.email), clean(b.phone), clean(b.department), clean(b.designation), clean(b.joinedOn)]
        );
        res.status(201).json({ id: result.insertId, employeeCode: code });
    } catch (error) {
        handleError(res, error, "Failed to create employee");
    }
});

/* UPDATE EMPLOYEE (also used to deactivate / reactivate) */
router.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid employee ID" });

    const b = req.body || {};
    const problem = validate(b);
    if (problem) return res.status(400).json({ message: problem });

    try {
        const [result] = await db.query(
            `UPDATE employees
             SET name = ?, email = ?, phone = ?, department = ?, designation = ?, joined_on = ?, is_active = ?
             WHERE id = ?`,
            [clean(b.name), clean(b.email), clean(b.phone), clean(b.department), clean(b.designation),
             clean(b.joinedOn), b.isActive === false ? 0 : 1, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: "Employee not found" });
        res.json({ message: "Employee updated" });
    } catch (error) {
        handleError(res, error, "Failed to update employee");
    }
});

module.exports = router;

const db = require("../../config/db");
const AppError = require("../../shared/AppError");

const COLUMNS = `id, employee_code, name, email, phone, department, designation,
    DATE_FORMAT(joined_on, '%Y-%m-%d') AS joined_on,
    DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth, gender, address,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, is_active`;

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

async function listEmployees() {
    const [rows] = await db.query(`SELECT ${COLUMNS} FROM employees ORDER BY is_active DESC, name`);
    return rows;
}

async function createEmployee(b) {
    let code = clean(b.employeeCode);
    if (!code) {
        const [[{ next }]] = await db.query("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM employees");
        code = `EMP-${String(next).padStart(4, "0")}`;
    }

    const [result] = await db.query(
        `INSERT INTO employees
         (employee_code, name, email, phone, department, designation, joined_on, date_of_birth, gender, address,
          emergency_contact_name, emergency_contact_relationship, emergency_contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, clean(b.name), clean(b.email), clean(b.phone), clean(b.department), clean(b.designation), clean(b.joinedOn),
         clean(b.dateOfBirth), clean(b.gender), clean(b.address), clean(b.emergencyContactName),
         clean(b.emergencyContactRelationship), clean(b.emergencyContactPhone)]
    );

    return { id: result.insertId, employeeCode: code };
}

/* Also used to deactivate / reactivate (isActive: false). */
async function updateEmployee(id, b) {
    const [result] = await db.query(
        `UPDATE employees
         SET name = ?, email = ?, phone = ?, department = ?, designation = ?, joined_on = ?,
             date_of_birth = ?, gender = ?, address = ?, emergency_contact_name = ?,
             emergency_contact_relationship = ?, emergency_contact_phone = ?, is_active = ?
         WHERE id = ?`,
        [clean(b.name), clean(b.email), clean(b.phone), clean(b.department), clean(b.designation), clean(b.joinedOn),
         clean(b.dateOfBirth), clean(b.gender), clean(b.address), clean(b.emergencyContactName),
         clean(b.emergencyContactRelationship), clean(b.emergencyContactPhone), b.isActive === false ? 0 : 1, id]
    );

    if (result.affectedRows === 0) throw new AppError(404, "Employee not found");
}

/*
    Permanently removes the employee AND their attendance records (attendance has a foreign key
    to employees, so the rows must go first). Use "is_active = false" via updateEmployee to keep history instead.
*/
async function deleteEmployee(id) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query("DELETE FROM attendance WHERE employee_id = ?", [id]);
        const [result] = await connection.query("DELETE FROM employees WHERE id = ?", [id]);
        if (result.affectedRows === 0) throw new AppError(404, "Employee not found");
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { listEmployees, createEmployee, updateEmployee, deleteEmployee };

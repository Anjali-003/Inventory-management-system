const service = require("./employee.service");
const AppError = require("../../shared/AppError");

const isBlank = (v) => !(typeof v === "string" && v.trim() !== "");
const validId = (id) => Number.isInteger(id) && id > 0;

function validate(b) {
    if (isBlank(b.name)) return "Name is required";
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return "Email is not valid";
    if (b.joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(b.joinedOn)) return "Joined date is not valid";
    if (b.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth)) return "Date of birth is not valid";
    if (b.emergencyContactPhone && !/^\+?[\d\s\-()]{7,20}$/.test(b.emergencyContactPhone)) return "Emergency contact phone is not valid";
    return null;
}

function handleError(res, error, fallback) {
    if (error instanceof AppError) {
        return res.status(error.status).json({ message: error.message });
    }
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Employee code or email already exists" });
    }
    res.status(500).json({ message: fallback });
}

/* GET ALL EMPLOYEES */
async function list(req, res) {
    try {
        res.json(await service.listEmployees());
    } catch (error) {
        handleError(res, error, "Failed to fetch employees");
    }
}

/* CREATE EMPLOYEE */
async function create(req, res) {
    const b = req.body || {};
    const problem = validate(b);
    if (problem) return res.status(400).json({ message: problem });

    try {
        res.status(201).json(await service.createEmployee(b));
    } catch (error) {
        handleError(res, error, "Failed to create employee");
    }
}

/* UPDATE EMPLOYEE (also used to deactivate / reactivate) */
async function update(req, res) {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(400).json({ message: "Invalid employee ID" });

    const b = req.body || {};
    const problem = validate(b);
    if (problem) return res.status(400).json({ message: problem });

    try {
        await service.updateEmployee(id, b);
        res.json({ message: "Employee updated" });
    } catch (error) {
        handleError(res, error, "Failed to update employee");
    }
}

/* DELETE EMPLOYEE (and their attendance records) */
async function remove(req, res) {
    const id = Number(req.params.id);
    if (!validId(id)) return res.status(400).json({ message: "Invalid employee ID" });

    try {
        await service.deleteEmployee(id);
        res.json({ message: "Employee deleted" });
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error(error);
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({ message: "Employee is referenced by other records and cannot be deleted" });
        }
        res.status(500).json({ message: "Failed to delete employee" });
    }
}

module.exports = { list, create, update, remove };

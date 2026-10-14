const service = require("./employee.service");
const AppError = require("../../shared/AppError");
const asyncHandler = require("../../middleware/asyncHandler");
const { parseId } = require("../../shared/validators");

const isBlank = (v) => !(typeof v === "string" && v.trim() !== "");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws 400 with the first problem found in the employee form. */
function validate(b) {
    if (isBlank(b.name)) throw AppError.badRequest("Name is required");
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) throw AppError.badRequest("Email is not valid");
    if (b.joinedOn && !DATE_RE.test(b.joinedOn)) throw AppError.badRequest("Joined date is not valid");
    if (b.dateOfBirth && !DATE_RE.test(b.dateOfBirth)) throw AppError.badRequest("Date of birth is not valid");
    if (b.emergencyContactPhone && !/^\+?[\d\s\-()]{7,20}$/.test(b.emergencyContactPhone)) {
        throw AppError.badRequest("Emergency contact phone is not valid");
    }
}

// friendlier messages for MySQL errors (defaults live in middleware/errorHandler.js)
const DUPLICATE = [409, "Employee code or email already exists"];
const REFERENCED = [409, "Employee is referenced by other records and cannot be deleted"];
const handler = (fn, message, db = { ER_DUP_ENTRY: DUPLICATE }) => asyncHandler(fn, { message, db });

/* GET ALL EMPLOYEES */
async function list(req, res) {
    res.json(await service.listEmployees());
}

/* CREATE EMPLOYEE */
async function create(req, res) {
    const body = req.body || {};
    validate(body);
    res.status(201).json(await service.createEmployee(body));
}

/* UPDATE EMPLOYEE (also used to deactivate / reactivate) */
async function update(req, res) {
    const id = parseId(req.params.id, "employee ID");
    const body = req.body || {};
    validate(body);

    await service.updateEmployee(id, body);
    res.json({ message: "Employee updated" });
}

/* DELETE EMPLOYEE (and their attendance records) */
async function remove(req, res) {
    const id = parseId(req.params.id, "employee ID");
    await service.deleteEmployee(id);
    res.json({ message: "Employee deleted" });
}

module.exports = {
    list: handler(list, "Failed to fetch employees"),
    create: handler(create, "Failed to create employee"),
    update: handler(update, "Failed to update employee"),
    remove: handler(remove, "Failed to delete employee", { ER_ROW_IS_REFERENCED_2: REFERENCED }),
};

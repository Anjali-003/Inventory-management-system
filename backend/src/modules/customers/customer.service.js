const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/* Saved customers for Marketing's bills (name is unique, so the list never shows the same customer twice). */

function cleanText(raw, max, label) {
    const text = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (text.length > max) throw new AppError(422, `${label} must be ${max} characters or fewer`, "VALIDATION");
    return text || null;
}

function parseCustomer(body) {
    const name = cleanText(body.name, 150, "Name");
    if (!name || name.length < 2) throw new AppError(422, "Customer name must be at least 2 characters", "VALIDATION", { field: "name" });
    return {
        name,
        address: cleanText(body.address, 500, "Address"),
        gstin: cleanText(body.gstin, 20, "GSTIN"),
        phone: cleanText(body.phone, 20, "Phone"),
    };
}

const mapRow = (r) => ({ id: r.id, name: r.name, address: r.address, gstin: r.gstin, phone: r.phone, bills: Number(r.bills || 0) });

async function list() {
    const [rows] = await db.query(
        `SELECT c.*, (SELECT COUNT(*) FROM bills b WHERE b.customer_id = c.id AND b.status = 'ACTIVE') AS bills
         FROM customers c ORDER BY c.name`
    );
    return rows.map(mapRow);
}

async function create(body, userId) {
    const c = parseCustomer(body);
    try {
        const [res] = await db.query(
            `INSERT INTO customers (name, address, gstin, phone, created_by) VALUES (?, ?, ?, ?, ?)`,
            [c.name, c.address, c.gstin, c.phone, userId]
        );
        return { id: res.insertId, ...c, bills: 0 };
    } catch (error) {
        if (error.errno === 1062) throw AppError.conflict(`A customer named "${c.name}" is already saved`, "DUPLICATE_CUSTOMER");
        throw error;
    }
}

async function update(id, body) {
    const c = parseCustomer(body);
    try {
        const [res] = await db.query(
            `UPDATE customers SET name = ?, address = ?, gstin = ?, phone = ? WHERE id = ?`,
            [c.name, c.address, c.gstin, c.phone, id]
        );
        if (!res.affectedRows) throw AppError.notFound("Customer not found", "NOT_FOUND");
        return { id, ...c };
    } catch (error) {
        if (error.errno === 1062) throw AppError.conflict(`A customer named "${c.name}" is already saved`, "DUPLICATE_CUSTOMER");
        throw error;
    }
}

module.exports = { list, create, update };

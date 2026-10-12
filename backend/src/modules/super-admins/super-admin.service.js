const bcrypt = require("bcryptjs");
const db = require("../../config/db");
const AppError = require("../../shared/AppError");
const hub = require("../../realtime/hub");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function list() {
    const [rows] = await db.query(
        `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, c.name AS created_by_name
         FROM users u LEFT JOIN users c ON c.id = u.created_by
         WHERE u.role = 'SUPER_ADMIN'
         ORDER BY u.id`
    );
    return rows;
}

/* Shared by the API and the CLI script. */
async function create({ name, email, password }, createdBy = null) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();

    if (!name) throw new AppError(400, "Name is required");
    if (!EMAIL_RE.test(email)) throw new AppError(400, "A valid email is required");
    if (!password || String(password).length < 8) {
        throw new AppError(400, "Password must be at least 8 characters");
    }

    const hash = await bcrypt.hash(String(password), 10);

    try {
        const [result] = await db.query(
            `INSERT INTO users (name, email, password_hash, role, created_by)
             VALUES (?, ?, ?, 'SUPER_ADMIN', ?)`,
            [name, email, hash, createdBy]
        );
        return { id: result.insertId, name, email, role: "SUPER_ADMIN", is_active: 1 };
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "A user with this email already exists");
        throw err;
    }
}

async function setActive(id, active, actorId) {
    if (!active && id === actorId) {
        throw new AppError(400, "You cannot deactivate your own account");
    }

    const [rows] = await db.query("SELECT id, is_active FROM users WHERE id = ? AND role = 'SUPER_ADMIN'", [id]);
    if (rows.length === 0) throw new AppError(404, "Super admin not found");

    if (!active) {
        const [[{ n }]] = await db.query(
            "SELECT COUNT(*) AS n FROM users WHERE role = 'SUPER_ADMIN' AND is_active = TRUE AND id <> ?",
            [id]
        );
        if (n === 0) throw new AppError(400, "At least one active super admin is required");
    }

    await db.query("UPDATE users SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);

    if (!active) hub.disconnectUser(id); // kick their open tabs immediately
    return { id, is_active: active };
}

module.exports = { list, create, setActive };

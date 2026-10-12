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

async function findByEmail(email) {
    const [rows] = await db.query(
        "SELECT id, name, email FROM users WHERE email = ? AND role = 'SUPER_ADMIN' LIMIT 1",
        [String(email || "").trim().toLowerCase()]
    );
    return rows[0] || null;
}

/*
    Change name, email and/or password of a super admin. Only the fields you pass are changed.
    Works for every super admin, including accounts created the old way (manual SQL / createHash.js).
*/
async function update(id, { name, email, password } = {}) {
    const [found] = await db.query("SELECT id FROM users WHERE id = ? AND role = 'SUPER_ADMIN'", [id]);
    if (found.length === 0) throw new AppError(404, "Super admin not found");

    const sets = [];
    const values = [];

    if (name !== undefined) {
        name = String(name).trim();
        if (!name) throw new AppError(400, "Name cannot be empty");
        sets.push("name = ?");
        values.push(name);
    }
    if (email !== undefined) {
        email = String(email).trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new AppError(400, "A valid email is required");
        sets.push("email = ?");
        values.push(email);
    }
    if (password !== undefined) {
        if (String(password).length < 8) throw new AppError(400, "Password must be at least 8 characters");
        sets.push("password_hash = ?");
        values.push(await bcrypt.hash(String(password), 10));
    }
    if (sets.length === 0) throw new AppError(400, "Nothing to update");

    try {
        await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "A user with this email already exists");
        throw err;
    }

    const [[user]] = await db.query("SELECT id, name, email, role, is_active FROM users WHERE id = ?", [id]);
    return user;
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

module.exports = { list, create, update, findByEmail, setActive };

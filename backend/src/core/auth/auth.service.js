const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../../config/db");
const env = require("../../config/env");
const AppError = require("../../shared/AppError");
const { ROLE_NAMES } = require("../../middleware/permissions");

/*
    Checks the email/password of an active user (SUPER_ADMIN, STORE_MANAGER ... see middleware/permissions.js) and returns a signed JWT plus the public user fields.
    Throws AppError(401 | 403) when the login is not allowed.
*/
async function login(email, password, role = "SUPER_ADMIN") {
    const [users] = await db.query(
        `
        SELECT
            id,
            name,
            email,
            password_hash,
            role,
            is_active

        FROM users

        WHERE email = ?
        LIMIT 1
        `,
        [email]
    );

    // Don't reveal whether the email exists or not.
    if (users.length === 0) {
        throw new AppError(401, "Invalid email or password");
    }

    const user = users[0];

    // Only active users with a known role can log in
    if (!ROLE_NAMES.includes(user.role) || !user.is_active) {
        throw new AppError(403, "Access denied");
    }

    // A user without a password hash cannot log in (create users with: npm run createuser)
    if (!user.password_hash) {
        throw new AppError(401, "Invalid email or password");
    }

    // Compare the password entered by the user with the bcrypt hash stored in MySQL.
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
        throw new AppError(401, "Invalid email or password");
    }

    // Right password, but this account belongs to another login page (checked after the password so
    // nobody can probe which emails exist).
    if (user.role !== role) {
        throw new AppError(403, "This account cannot log in on this page. Please use your own login page.");
    }

    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role
        },

        env.jwt.secret,

        {
            expiresIn: env.jwt.expiresIn
        }
    );

    // Never send password_hash.
    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
}

/*
    Verifies the JWT from the cookie and returns the matching user.
    Throws AppError(401) when there is no token, the token is invalid/expired, or the user no longer exists.
*/
async function getCurrentUser(token) {
    if (!token) {
        throw new AppError(401, "Not authenticated");
    }

    let decoded;
    try {
        decoded = jwt.verify(token, env.jwt.secret);
    } catch {
        throw new AppError(401, "Not authenticated");
    }

    const [users] = await db.query(
        `
        SELECT
            id,
            name,
            email,
            role,
            created_at

        FROM users

        WHERE id = ? AND is_active = TRUE

        LIMIT 1
        `,
        [decoded.userId]
    );

    if (users.length === 0) {
        throw new AppError(401, "User not found");
    }

    return users[0];
}

/* Used by the resolveUser middleware: { id, name } of a user, or null if that user no longer exists. */
async function findUserById(id) {
    const [rows] = await db.query("SELECT id, name FROM users WHERE id = ?", [id]);
    return rows[0] || null;
}

/*
    The logged-in user changes their own password. The current password must be right (so a tab left open cannot
    be used to take the account over), the new one follows the same rule as create-user (8+ characters).
*/
async function changePassword(userId, currentPassword, newPassword) {
    const current = String(currentPassword || "");
    const next = String(newPassword || "");
    if (!current) throw new AppError(422, "Enter your current password", "VALIDATION", { field: "current_password" });
    if (next.length < 8) throw new AppError(422, "The new password must be at least 8 characters", "VALIDATION", { field: "new_password" });
    if (next.length > 128) throw new AppError(422, "The new password must be 128 characters or fewer", "VALIDATION", { field: "new_password" });

    const [rows] = await db.query("SELECT password_hash FROM users WHERE id = ? AND is_active = TRUE LIMIT 1", [userId]);
    if (rows.length === 0) throw AppError.unauthorized("Not authenticated");
    if (!(await bcrypt.compare(current, rows[0].password_hash))) {
        throw new AppError(422, "Your current password is not correct", "WRONG_PASSWORD", { field: "current_password" });
    }
    if (await bcrypt.compare(next, rows[0].password_hash)) {
        throw new AppError(422, "The new password must be different from the current one", "VALIDATION", { field: "new_password" });
    }

    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(next, 10), userId]);
    return { message: "Password changed" };
}

module.exports = { login, getCurrentUser, findUserById, changePassword };

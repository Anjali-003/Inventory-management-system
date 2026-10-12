const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../../config/db");
const AppError = require("../../shared/AppError");

/*
    Checks the email/password of a SUPER_ADMIN and returns a signed JWT plus the public user fields.
    Throws AppError(401 | 403) when the login is not allowed.
*/
async function login(email, password) {
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

    // Only active super admins can log in
    if (user.role !== "SUPER_ADMIN" || !user.is_active) {
        throw new AppError(403, "Access denied");
    }

    // A user without a password hash cannot log in (create super admins with: npm run superadmin)
    if (!user.password_hash) {
        throw new AppError(401, "Invalid email or password");
    }

    // Compare the password entered by the user with the bcrypt hash stored in MySQL.
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
        throw new AppError(401, "Invalid email or password");
    }

    const token = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role
        },

        process.env.JWT_SECRET,

        {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d"
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
    Throws AppError(401) when there is no token or the user no longer exists.
    jwt.verify() itself throws if the token is invalid or expired.
*/
async function getCurrentUser(token) {
    if (!token) {
        throw new AppError(401, "Not authenticated");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await db.query(
        `
        SELECT
            id,
            name,
            email,
            role

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

module.exports = { login, getCurrentUser, findUserById };

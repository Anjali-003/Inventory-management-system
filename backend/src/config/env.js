/**
 * The ONLY place that reads process.env.
 * Everything else imports the typed, validated `env` object from here.
 *
 * Copy backend/.env.example to backend/.env and fill it in. Never commit .env.
 */
const path = require("path");

// Loaded here (once) so scripts, tests and the server all see the same values.
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const hint = "Copy backend/.env.example to backend/.env and fill them in.";

function assertPresent(keys) {
    const missing = keys.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variable(s): ${missing.join(", ")}. ${hint}`);
    }
}

// Database scripts (migrate, seed...) only need the database settings.
assertPresent(["DB_HOST", "DB_USER", "DB_NAME"]);

const toInt = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

const nodeEnv = process.env.NODE_ENV || "development";

const env = {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: toInt(process.env.PORT, 5000),

    db: Object.freeze({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME,
        port: toInt(process.env.DB_PORT, 3306),
        connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    }),

    jwt: Object.freeze({
        secret: process.env.JWT_SECRET || "",
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }),

    cookie: Object.freeze({
        name: "access_token",
        maxAgeMs: 24 * 60 * 60 * 1000,
        // set COOKIE_SECURE=true when the API is served over https
        secure: process.env.COOKIE_SECURE === "true",
    }),

    // one extra browser origin allowed by CORS (e.g. a dev tunnel or the production site)
    clientOrigin: process.env.CLIENT_ORIGIN || "",
    // the Vite dev server port, used to allow localhost / LAN origins in development
    clientDevPort: toInt(process.env.CLIENT_DEV_PORT, 5173),
};

/** Called once by server.js: the API also needs the settings the database scripts do not. */
env.assertServerConfig = () => assertPresent(["JWT_SECRET"]);

module.exports = env;

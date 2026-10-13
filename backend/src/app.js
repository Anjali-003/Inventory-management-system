/**
 * Builds the Express app (no port, no listen) so it can be started by server.js and imported by tests.
 */
const express = require("express");
const cookieParser = require("cookie-parser");

const corsMiddleware = require("./config/cors");
const db = require("./config/db");
const { buildApiRouter } = require("./routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const asyncHandler = require("./middleware/asyncHandler");

/** Current API version. New breaking changes go in a new prefix (/api/v2) next to this one. */
const API_VERSION_PREFIX = "/api/v1";
/** The original, unversioned prefix keeps working so existing clients are not broken. */
const LEGACY_API_PREFIX = "/api";

function createApp() {
    const app = express();
    app.disable("x-powered-by");

    app.use(corsMiddleware);
    app.use(express.json());
    app.use(cookieParser());

    app.get("/", (req, res) => res.send("Server is running"));

    // Liveness + database check (used by uptime monitors / load balancers). No login needed.
    app.get(
        `${API_VERSION_PREFIX}/health`,
        asyncHandler(async (req, res) => {
            await db.query("SELECT 1");
            res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
        }, { message: "Database is not reachable" })
    );

    const api = buildApiRouter();
    app.use(API_VERSION_PREFIX, api);
    app.use(LEGACY_API_PREFIX, api);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp, API_VERSION_PREFIX, LEGACY_API_PREFIX };

/**
 * Process entry point: validate config, start listening, shut down cleanly.
 * The app itself is built in src/app.js.
 */
const env = require("./src/config/env");
env.assertServerConfig();

const db = require("./src/config/db");
const { createApp } = require("./src/app");
const { startPurgeJob } = require("./src/shared/idempotency");

const app = createApp();

const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
});

// forget idempotency keys that are too old for any client to retry (keeps the table small)
startPurgeJob(db);

// every hour: tell the Super Admin about orders stuck 3+ days at one step (once a day per order)
require("./src/modules/reports/order-tracker.service").startStuckOrderJob();

async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);

    // Live-update (SSE) streams never end by themselves, so close them or server.close() would wait forever.
    server.closeAllConnections();
    server.close(async () => {
        try {
            await db.end();
        } finally {
            process.exit(0);
        }
    });

    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
});

/**
 * Connection settings for the database scripts (migrate, seed, schema tools).
 * Credentials come from config/env.js, the single place that reads .env.
 */
const mysql = require("mysql2/promise");
const env = require("../../config/env");

/**
 * @param {object}  [options]
 * @param {boolean} [options.withDatabase=true]      false = connect to the server only (schema.sql creates the database itself)
 * @param {boolean} [options.multipleStatements=false] allow "a; b; c" in one query (needed to run .sql files)
 */
function connectionConfig({ withDatabase = true, multipleStatements = false } = {}) {
    return {
        host: env.db.host,
        user: env.db.user,
        password: env.db.password,
        port: env.db.port,
        ...(withDatabase ? { database: env.db.database } : {}),
        ...(multipleStatements ? { multipleStatements: true } : {}),
    };
}

const connect = (options) => mysql.createConnection(connectionConfig(options));

module.exports = { connectionConfig, connect, env };

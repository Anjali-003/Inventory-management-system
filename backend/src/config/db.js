const mysql = require("mysql2/promise");
const env = require("./env");

/** Shared MySQL connection pool. */
const pool = mysql.createPool({
    host: env.db.host,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    port: env.db.port,
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0,
});

module.exports = pool;

const db = require("../../config/db");

async function listComponents() {
    const [rows] = await db.query(
        "SELECT * FROM components ORDER BY id"
    );

    return rows;
}

module.exports = { listComponents };

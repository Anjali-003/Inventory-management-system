const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const DIR = path.join(__dirname, "migrations");
const baseline = process.argv.includes("--baseline");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, port: process.env.DB_PORT, multipleStatements: true,
  });

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  const [done] = await db.query("SELECT name FROM schema_migrations");
  const applied = new Set(done.map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    if (!baseline) {
      console.log(`Running ${file}...`);
      try {
        await db.query(fs.readFileSync(path.join(DIR, file), "utf8"));
      } catch (err) {
        console.error(`FAILED ${file}: ${err.message}`);
        process.exitCode = 1;
        break; // MySQL DDL can't be rolled back, so stop and fix by hand
      }
    }
    await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`${baseline ? "Baselined" : "Applied"} ${file}`);
  }
  await db.end();
})();
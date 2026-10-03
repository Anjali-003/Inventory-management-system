// npm run schema:dump  ->  rewrites schema.sql from the live (fully migrated) database.
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { dumpSchema, HEADER, FOOTER } = require("./lib/dumpSchema");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, port: process.env.DB_PORT,
  });
  try {
    const [pending] = await db.query("SELECT name FROM schema_migrations").catch(() => [[]]);
    const done = new Set(pending.map((r) => r.name));
    const files = fs.readdirSync(path.join(__dirname, "migrations")).filter((f) => f.endsWith(".sql"));
    const missing = files.filter((f) => !done.has(f));
    if (missing.length) {
      console.error(`Refusing to dump: ${missing.length} migration(s) not applied yet (${missing[0]}...). Run npm run migrate first.`);
      process.exitCode = 1;
      return;
    }
    const target = path.join(__dirname, "schema.sql");
    const dbName = process.env.DB_NAME.replace(/`/g, "``");
    const dbLines = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;\nUSE \`${dbName}\`;\n\n`;
    fs.writeFileSync(target, HEADER + dbLines + (await dumpSchema(db, { idempotent: true })) + FOOTER);
    console.log(`schema.sql updated from database "${process.env.DB_NAME}".`);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

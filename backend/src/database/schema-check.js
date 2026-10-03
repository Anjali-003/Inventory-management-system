// npm run schema:check -> proves schema.sql == live database structure.
// Builds a throw-away database from schema.sql, compares it with the real one, drops it.
// Needs CREATE/DROP DATABASE permission. Exit code 1 when they differ (usable in CI).
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { dumpSchema } = require("./lib/dumpSchema");

const conf = { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: process.env.DB_PORT };

(async () => {
  const tmpName = `${process.env.DB_NAME}_schema_check`;
  const admin = await mysql.createConnection({ ...conf, multipleStatements: true });
  const live = await mysql.createConnection({ ...conf, database: process.env.DB_NAME });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${tmpName}\`; CREATE DATABASE \`${tmpName}\`; USE \`${tmpName}\`;`);
    // schema.sql starts with CREATE DATABASE / USE <real db>. Strip them, otherwise the file would
    // run against the REAL database instead of the throw-away one.
    const sql = fs
      .readFileSync(path.join(__dirname, "schema.sql"), "utf8")
      .replace(/^\s*CREATE\s+DATABASE\b[^;]*;/gim, "")
      .replace(/^\s*USE\s+[^;]*;/gim, "");
    await admin.query(sql);
    const fresh = await dumpSchema(admin);
    const real = await dumpSchema(live);

    if (fresh === real) {
      console.log("OK: schema.sql matches the database.");
      return;
    }
    const a = fresh.split("\n"), b = real.split("\n");
    const onlyInSchema = a.filter((l) => !b.includes(l)), onlyInDb = b.filter((l) => !a.includes(l));
    console.error("OUT OF SYNC. Run `npm run schema:dump` (after `npm run migrate`).\n");
    onlyInSchema.slice(0, 15).forEach((l) => console.error(`  schema.sql only: ${l}`));
    onlyInDb.slice(0, 15).forEach((l) => console.error(`  database only:   ${l}`));
    process.exitCode = 1;
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${tmpName}\``).catch(() => {});
    await admin.end();
    await live.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

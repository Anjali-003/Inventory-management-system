// npm run schema:dump  ->  rewrites schema.sql from the live (fully migrated) database.
const fs = require("fs");
const path = require("path");
const { connect, env } = require("./lib/connection");
const { dumpSchema, HEADER, FOOTER } = require("./lib/dumpSchema");

(async () => {
  const db = await connect();
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
    const dbName = env.db.database.replace(/`/g, "``");
    const dbLines = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;\nUSE \`${dbName}\`;\n\n`;
    fs.writeFileSync(target, HEADER + dbLines + (await dumpSchema(db, { idempotent: true })) + FOOTER);
    console.log(`schema.sql updated from database "${env.db.database}".`);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });

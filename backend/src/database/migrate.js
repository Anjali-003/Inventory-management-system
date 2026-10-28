/*
    npm run migrate            runs every migration in migrations/ not applied yet; when one ran, schema.sql is
                               rewritten from the database afterwards (schema:dump), so the two never drift apart
    npm run migrate:baseline   marks them all as applied WITHOUT running them: for a database just built from
                               schema.sql, which already contains them (npm run db:setup does this)
*/
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { connect } = require("./lib/connection");

const DIR = path.join(__dirname, "migrations");
const baseline = process.argv.includes("--baseline");

(async () => {
  const db = await connect({ multipleStatements: true });

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  const [done] = await db.query("SELECT name FROM schema_migrations");
  const applied = new Set(done.map((r) => r.name));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;

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
      ran++;
    }
    await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`${baseline ? "Baselined" : "Applied"} ${file}`);
  }
  await db.end();

  // the structure changed: rewrite schema.sql too (schema:dump), so a new database built from it is never behind.
  // Nothing ran (or one failed) -> schema.sql is left alone.
  if (ran > 0 && !process.exitCode) {
    const res = spawnSync(process.execPath, [path.join(__dirname, "schema-dump.js")], { stdio: "inherit" });
    if (res.status !== 0) console.error("The migrations are applied, but schema.sql could not be updated: run npm run schema:dump.");
  }
})();
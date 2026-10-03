// Builds a normalised, data-free snapshot of a database's structure using plain SQL
// (SHOW CREATE ...), so no mysqldump binary is needed. Same function is used to write
// schema.sql and to compare it with the live DB, so both sides are formatted identically.

const SKIP = new Set(["schema_migrations"]);

const clean = (sql) =>
  sql
    .replace(/\sAUTO_INCREMENT=\d+/g, "")          // counters differ per DB, not part of the structure
    .replace(/DEFINER=`[^`]*`@`[^`]*`\s*/g, "")    // same structure regardless of who created it
    .trim();

// idempotent=true makes the output safe to run twice (used for the schema.sql file).
// The comparison in schema-check uses idempotent=false so both sides stay byte-identical.
async function dumpSchema(db, { idempotent = false } = {}) {
  const [tables] = await db.query("SHOW FULL TABLES");
  const key = Object.keys(tables[0] || { t: 1 })[0];
  const out = [];

  const names = tables.filter((r) => r.Table_type === "BASE TABLE").map((r) => r[key]).filter((n) => !SKIP.has(n)).sort();
  const views = tables.filter((r) => r.Table_type === "VIEW").map((r) => r[key]).sort();

  for (const name of names) {
    const [[row]] = await db.query(`SHOW CREATE TABLE \`${name}\``);
    const sql = clean(row["Create Table"]);
    out.push(`${idempotent ? sql.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ") : sql};`);
  }
  for (const name of views) {
    const [[row]] = await db.query(`SHOW CREATE VIEW \`${name}\``);
    const sql = clean(row["Create View"]);
    out.push(`${idempotent ? sql.replace(/^CREATE /, "CREATE OR REPLACE ") : sql};`);
  }
  const [triggers] = await db.query("SHOW TRIGGERS");
  for (const t of triggers.sort((a, b) => a.Trigger.localeCompare(b.Trigger))) {
    const [[row]] = await db.query(`SHOW CREATE TRIGGER \`${t.Trigger}\``);
    const sql = clean(row["SQL Original Statement"]);
    out.push(`${idempotent ? `DROP TRIGGER IF EXISTS \`${t.Trigger}\`;\n` : ""}${sql};`);
  }
  return out.join("\n\n") + "\n";
}

const HEADER =
  "-- GENERATED FILE. Do not edit by hand: run `npm run schema:dump` after adding a migration.\n" +
  "-- Structure only (no data). schema_migrations is created by migrate.js.\n" +
  "SET FOREIGN_KEY_CHECKS = 0;\n\n";
const FOOTER = "\nSET FOREIGN_KEY_CHECKS = 1;\n";

module.exports = { dumpSchema, HEADER, FOOTER };

const fs = require("fs");
const path = require("path");
const { connect } = require("./lib/connection");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node run-sql.js <file.sql>");
  process.exit(1);
}

(async () => {
  // No database name here: schema.sql creates the database itself (CREATE DATABASE + USE).
  const db = await connect({ withDatabase: false, multipleStatements: true });
  try {
    await db.query(fs.readFileSync(path.join(__dirname, file), "utf8"));
    console.log(`Ran ${file}`);
  } catch (err) {
    console.error(`FAILED ${file}: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
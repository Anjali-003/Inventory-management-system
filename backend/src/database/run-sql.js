const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node run-sql.js <file.sql>");
  process.exit(1);
}

(async () => {
  // Database ka naam yahan nahi diya, kyunki schema.sql khud database banata hai (CREATE DATABASE + USE)
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT, multipleStatements: true,
  });
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
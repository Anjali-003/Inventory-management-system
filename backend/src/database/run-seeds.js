/*
    Runs the .sql files in setup_data/ in filename order, one after the other.
    Stops at the first file that fails, so a later file never runs on top of a half-loaded earlier one.

      npm run seed:reset   runs ONLY 01_reset_data.sql (deletes data, cannot be undone, asks "yes" first)
      npm run seed         runs everything EXCEPT the reset file (02, 03, 04 ...)

    Fresh load:  npm run seed:reset   then   npm run seed
    Take a backup first (see the mysqldump line in 01_reset_data.sql).
*/
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const DIR = path.join(__dirname, "setup_data");
const resetMode = process.argv.includes("--reset");
const isReset = (f) => /reset/i.test(f);

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a.trim().toLowerCase()); });
  });

(async () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (resetMode ? isReset(f) : !isReset(f)))
    .sort();

  if (files.length === 0) {
    console.error(`No matching .sql files found in ${DIR}`);
    process.exit(1);
  }

  console.log(`Database: ${process.env.DB_NAME || "inventory_management"} @ ${process.env.DB_HOST}`);
  console.log("Will run, in this order:");
  files.forEach((f) => console.log(`  - ${f}`));

  if (resetMode) {
    console.log("\nWARNING: this deletes products, components, stock, the stock ledger, BOMs, orders and production data.");
    if (!process.stdin.isTTY) {
      console.error("Not an interactive terminal, so the confirmation cannot be asked. Run `npm run seed:reset` from a normal terminal.");
      process.exit(1);
    }
    if ((await ask('Type "yes" to continue: ')) !== "yes") {
      console.log("Cancelled. Nothing was changed.");
      process.exit(0);
    }
  }

  // No database in the connection: the files select it themselves (USE inventory_management).
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT, multipleStatements: true,
    charset: "utf8mb4", // keeps symbols such as the degree sign in "105°C"
  });

  try {
    for (const file of files) {
      process.stdout.write(`Running ${file} ... `);
      await db.query(fs.readFileSync(path.join(DIR, file), "utf8"));
      console.log("done");
    }
    console.log("\nAll files ran successfully.");
  } catch (err) {
    console.log("FAILED");
    console.error(`${err.message}\nStopped. Files after the failed one were not run.`);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();

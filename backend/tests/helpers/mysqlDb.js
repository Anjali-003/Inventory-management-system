/**
 * A throw-away MySQL database for the tests that need the real thing (tests/mysql, tests/e2e).
 *
 *   const testDb = throwaway("production");   // FIRST, before requiring anything from src/: the app's db then
 *                                             // talks to <DB_NAME>_production, never to the real database
 *   beforeAll(testDb.create);                 // built from schema.sql
 *   beforeEach(testDb.reset);                 // every table emptied, then the basics put in: returns `fixtures`
 *   afterAll(testDb.drop);
 *
 * The basics (seedBasics) are the same for every test and need nothing from the real database, so the tests run on
 * a new computer or in CI with an empty MySQL:
 *   - one active user per role (logins are made with a signed token, so they have no password)
 *   - "Controller": 3 components (2 + 1 + 4 per unit), "Sensor": 2 components (1 + 3 per unit)
 *   - 100,000 of every component in stock, written through the ledger like a real stock-in, standard cost 1.50
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const ROLES = [
  "SUPER_ADMIN", "MARKETING_MANAGER", "OPERATIONS_ADMIN", "PURCHASE_MANAGER", "IQC_MANAGER",
  "STORE_MANAGER", "PRODUCTION_MANAGER", "PRODUCTION_ADMIN", "QUALITY_FG_MANAGER", "HR_MANAGER",
];

const PRODUCTS = [
  { sku: "T-CTRL", name: "Controller", parts: [["T-R100", "Resistor 100K", 2], ["T-C10", "Capacitor 10uF", 1], ["T-SCR", "Screw M3", 4]] },
  { sku: "T-SENS", name: "Sensor", parts: [["T-PRB", "Probe", 1], ["T-CBL", "Cable 1m", 3]] },
];
const STOCK = 100000;

const withoutDatabaseLines = (sql) => sql.replace(/^\s*CREATE\s+DATABASE\b[^;]*;/gim, "").replace(/^\s*USE\s+[^;]*;/gim, "");

async function seedBasics(conn) {
  const users = {};
  for (const role of ROLES) {
    const [r] = await conn.query(
      `INSERT INTO users (name, email, role, is_active) VALUES (?, ?, ?, 1)`,
      [`Test ${role.toLowerCase().replace(/_/g, " ")}`, `${role.toLowerCase()}@test.local`, role]
    );
    users[role] = r.insertId;
  }

  const products = {};
  for (const p of PRODUCTS) {
    const [made] = await conn.query(`INSERT INTO products (sku, name, is_active) VALUES (?, ?, 1)`, [p.sku, p.name]);
    const components = [];
    for (const [sku, name, perUnit] of p.parts) {
      const [c] = await conn.query(`INSERT INTO components (sku, name, unit, standard_cost) VALUES (?, ?, 'pcs', 1.5)`, [sku, name]);
      await conn.query(`INSERT INTO product_bom (product_id, component_id, quantity_required) VALUES (?, ?, ?)`, [made.insertId, c.insertId, perUnit]);
      await conn.query(`INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0)`, [c.insertId, STOCK]);
      await conn.query(
        `INSERT INTO inventory_transactions (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
         VALUES (?, 'STOCK_IN', 'IN', ?, ?, 'test opening stock', ?)`,
        [c.insertId, STOCK, STOCK, users.SUPER_ADMIN]
      );
      components.push({ id: c.insertId, sku, name, perUnit });
    }
    products[p.name] = { id: made.insertId, sku: p.sku, name: p.name, components };
  }
  return { users, products, stock: STOCK };
}

function throwaway(suffix) {
  const live = process.env.DB_NAME;
  if (!live) throw new Error("DB_NAME is not set (.env)");
  const name = `${live}_${suffix}`;
  process.env.DB_NAME = name; // everything required from src/ after this talks to the copy
  const { connect } = require("../../src/database/lib/connection");

  const admin = () => connect({ withDatabase: false, multipleStatements: true });

  return {
    name,
    async create() {
      const conn = await admin();
      try {
        const schema = withoutDatabaseLines(fs.readFileSync(path.join(__dirname, "../../src/database/schema.sql"), "utf8"));
        await conn.query(`DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\`; USE \`${name}\`;`);
        await conn.query(schema);
      } finally {
        await conn.end();
      }
    },
    /** Empties every table (TRUNCATE: the stock ledger refuses DELETE) and puts the basics back. */
    async reset() {
      const conn = await admin();
      try {
        await conn.query(`USE \`${name}\``);
        const [tables] = await conn.query(
          `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
          [name]
        );
        await conn.query("SET FOREIGN_KEY_CHECKS = 0");
        for (const { t } of tables) await conn.query(`TRUNCATE TABLE \`${t}\``);
        await conn.query("SET FOREIGN_KEY_CHECKS = 1");
        return await seedBasics(conn);
      } finally {
        await conn.end();
      }
    },
    async drop() {
      // the app's pool would keep the database busy: close it first when it was opened
      const key = require.resolve("../../src/config/db");
      if (require.cache[key]) await require(key).end().catch(() => {});
      const conn = await admin();
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
      } finally {
        await conn.end();
      }
    },
  };
}

module.exports = { throwaway, seedBasics, ROLES };

/*
    "Save game" for manual testing: save every row of the database under a name, and bring it back later.

      npm run db:save billing     saves the data as it is now      -> backend/snapshots/billing.json
      npm run db:load billing     puts that data back (everything since then is gone; it is saved first as
                                  "last-before-load", so `npm run db:load last-before-load` undoes a load)
      npm run db:list             the saved names

    Only the DATA is saved, never the tables: the tables stay as the migrations made them. So a snapshot taken before
    a new migration still loads: columns it does not know keep their default, tables it does not know start empty.
    schema_migrations is never touched. Only the database named in .env (DB_NAME) is used.
*/
const fs = require("fs");
const path = require("path");
const { connectionConfig, env } = require("./lib/connection");
const mysql = require("mysql2/promise");

const DIR = path.join(__dirname, "..", "..", "snapshots");
const KEEP = new Set(["schema_migrations"]); // the migration record belongs to the tables, not to the data
const BATCH = 500;
const SAFETY = "last-before-load"; // saved automatically before every load

const [command, rawName] = process.argv.slice(2);
const name = (rawName || "").trim();
const fileOf = (n) => path.join(DIR, `${n}.json`);

function fail(message) {
    console.error(message);
    process.exit(1);
}

async function tablesOf(db) {
    const [rows] = await db.query(
        `SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
        [env.db.database]
    );
    return rows.map((r) => r.t).filter((t) => !KEEP.has(t));
}

// dates stay as the text MySQL sent (no time-zone shift); binary is kept as base64
const toFile = (v) => (Buffer.isBuffer(v) ? { $base64: v.toString("base64") } : v);
const fromFile = (v) => {
    if (v && typeof v === "object" && "$base64" in v) return Buffer.from(v.$base64, "base64");
    if (v && typeof v === "object") return JSON.stringify(v); // a JSON column
    return v;
};

async function save(db, name) {
    const data = {};
    let rows = 0;
    for (const t of await tablesOf(db)) {
        const [r] = await db.query(`SELECT * FROM \`${t}\``);
        data[t] = r.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toFile(v)])));
        rows += r.length;
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(fileOf(name), JSON.stringify({ savedAt: new Date().toISOString(), database: env.db.database, tables: data }));
    console.log(`Saved "${name}": ${Object.keys(data).length} tables, ${rows} rows -> snapshots/${name}.json`);
}

async function load(db, name) {
    if (!fs.existsSync(fileOf(name))) fail(`No snapshot called "${name}". Saved ones: ${list().join(", ") || "none"}`);
    const snap = JSON.parse(fs.readFileSync(fileOf(name), "utf8"));
    const tables = await tablesOf(db);
    let rows = 0;

    // TRUNCATE cannot be rolled back, so the data as it is now is saved first: a failed load is undone with
    // `npm run db:load last-before-load`. (TRUNCATE, not DELETE: the stock ledger refuses DELETE by a trigger.)
    if (name !== SAFETY) await save(db, SAFETY);

    await db.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
        for (const t of tables) await db.query(`TRUNCATE TABLE \`${t}\``);
        await db.beginTransaction();
        for (const t of tables) {
            const saved = snap.tables[t] || [];
            if (saved.length === 0) continue;
            // only the columns the table has today (a generated column is filled by MySQL itself)
            const [cols] = await db.query(`SHOW COLUMNS FROM \`${t}\``);
            // (not DEFAULT_GENERATED: that is only "defaults to now", e.g. created_at, and must be loaded)
            const now = new Set(cols.filter((c) => !/\b(VIRTUAL|STORED) GENERATED\b/i.test(c.Extra)).map((c) => c.Field));
            const keys = Object.keys(saved[0]).filter((k) => now.has(k));
            for (let i = 0; i < saved.length; i += BATCH) {
                const values = saved.slice(i, i + BATCH).map((row) => keys.map((k) => fromFile(row[k])));
                await db.query(`INSERT INTO \`${t}\` (${keys.map((k) => `\`${k}\``).join(", ")}) VALUES ?`, [values]);
            }
            rows += saved.length;
        }
        await db.commit();
    } catch (err) {
        await db.rollback().catch(() => {});
        if (name !== SAFETY) err.message += `\nThe data may be half loaded. Put back what you had: npm run db:load ${SAFETY}`;
        throw err;
    } finally {
        await db.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    console.log(`Loaded "${name}" (saved ${new Date(snap.savedAt).toLocaleString()}): ${rows} rows. Refresh the app.`);
}

function list() {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
}

(async () => {
    if (command === "list") {
        const names = list();
        console.log(names.length ? names.map((n) => `  ${n}   (${fs.statSync(fileOf(n)).mtime.toLocaleString()})`).join("\n") : "No snapshots yet. Save one: npm run db:save <name>");
        return;
    }
    if (!["save", "load"].includes(command)) fail("Use: npm run db:save <name> | npm run db:load <name> | npm run db:list");
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(name)) fail(`Give it a name (letters, numbers, - or _), e.g. npm run db:${command} billing`);

    const db = await mysql.createConnection({ ...connectionConfig(), dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, charset: "utf8mb4" });
    try {
        console.log(`Database: ${env.db.database} @ ${env.db.host}`);
        if (command === "save") await save(db, name);
        else await load(db, name);
    } catch (err) {
        console.error(`Failed: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

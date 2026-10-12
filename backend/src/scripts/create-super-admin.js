/*
    Usage:
      npm run superadmin
        -> asks name, email and password (password is not echoed)

      npm run superadmin -- --name "Rahul" --email rahul@company.com [--password ...]
        -> skips the questions you already answered (handy for scripts/CI)
*/
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const readline = require("readline");
const superAdminService = require("../modules/super-admins/super-admin.service");
const db = require("../config/db");

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : undefined;
}

function ask(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
        rl.question(question, (answer) => { rl.output.write("\n"); rl.close(); resolve(answer); });
    });
}

(async () => {
    try {
        const name = arg("name") || (await ask("Name: "));
        const email = arg("email") || (await ask("Email: "));

        const password = arg("password") || (await askHidden("Password (min 8 chars): "));
        const user = await superAdminService.create({ name, email, password });
        console.log(`Super admin created: #${user.id} ${user.email}`);
    } catch (err) {
        console.error("Failed:", err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

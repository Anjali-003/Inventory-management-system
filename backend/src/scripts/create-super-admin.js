const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "../../.env")
});

const { input, password } = require("@inquirer/prompts");

const superAdminService = require("../modules/super-admins/super-admin.service");
const db = require("../config/db");

async function main() {
    try {
        const name = await input({
            message: "Enter name:"
        });

        const email = await input({
            message: "Enter email:"
        });

        const pass = await password({
            message: "Enter password (min 8 chars):"
        });

        const user = await superAdminService.create({
            name,
            email,
            password: pass
        });

        console.log(`Super admin created: #${user.id} ${user.email}`);
    } catch (err) {
        console.error("Failed:", err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
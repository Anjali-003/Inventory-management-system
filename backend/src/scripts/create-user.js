/*
    Create a login from the terminal (only the backend developer can do this):

        npm run create-user

    It asks for name, email, password and the ROLE (SUPER_ADMIN, STORE_MANAGER ...).
    Roles come from src/middleware/permissions.js, so a new role shows up here automatically.
    Create as many users per role as you need (e.g. 3 store managers = run it 3 times).

    `npm run super-admin` still works and always creates a SUPER_ADMIN.
*/
const { input, password, select } = require("@inquirer/prompts");

const superAdminService = require("../core/super-admins/super-admin.service");
const { ROLE_NAMES } = require("../middleware/permissions");
const db = require("../config/db");

// "STORE_MANAGER" -> "Store Manager"; only names that do not read well that way are listed
const LABELS = { IQC_MANAGER: "IQC Manager", QUALITY_FG_MANAGER: "Quality Control & Finished Goods Manager", HR_MANAGER: "HR Manager" };
const labelOf = (role) => LABELS[role] || role.toLowerCase().replace(/(^|_)(\w)/g, (_, sep, c) => (sep ? " " : "") + c.toUpperCase());

async function main() {
    try {
        const role = await select({
            message: "Select role:",
            choices: ROLE_NAMES.map((r) => ({ name: labelOf(r), value: r })),
            pageSize: ROLE_NAMES.length, // show every role at once (the default of 7 hid the last ones below the fold)
            loop: false
        });

        const name = await input({ message: "Enter name:" });
        const email = await input({ message: "Enter email:" });
        const pass = await password({ message: "Enter password (min 8 chars):" });

        // it is used to create any type of user, not just super-admins
        const user = await superAdminService.createUser({ name, email, password: pass, role });

        console.log(`User created: #${user.id} ${user.email} (${user.role})`);
    } catch (err) {
        console.error("Failed:", err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();

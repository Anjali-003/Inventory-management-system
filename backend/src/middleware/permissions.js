const AppError = require("../shared/AppError");

/*
    ROLE PERMISSIONS (backend). Keep in sync with frontend/src/lib/permissions.js

    users.role is a plain string in MySQL. For every module a role gets:
        "edit"  -> GET + POST/PUT/PATCH/DELETE
        "view"  -> GET only (read-only)
        (none)  -> 403
    SUPER_ADMIN ("*") can do everything.

    TO ADD A ROLE LATER (e.g. IQC, PURCHASE_MANAGER): add it to ACCESS below, then to ROLES in
    scripts/create-user.js (it uses ROLE_NAMES from this file, so nothing else to change there).
    Store Manager already has "iqc" / "purchase": "view" for the pages that will come later.
*/
const ACCESS = {
    SUPER_ADMIN: "*",

    STORE_MANAGER: {
        inventory: "edit",
        inventoryHistory: "edit",
        finishedGoods: "edit",
        // future modules: can look, cannot change
        iqc: "view",
        purchase: "view"
    }
};

const ROLE_NAMES = Object.keys(ACCESS);

/*
    Every role logs in through its OWN endpoint:  POST /api/v1/auth<path>
    (frontend page for each one: LOGIN_PORTALS in frontend/src/lib/permissions.js).
    A store manager's email/password is refused on the super admin endpoint and the other way round.
    New role = one more line here (+ one in the frontend LOGIN_PORTALS).
*/
const LOGIN_ROUTES = {
    SUPER_ADMIN: "/login",
    STORE_MANAGER: "/store-manager/login"
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function levelOf(role, module) {
    const rule = ACCESS[role];
    if (!rule) return null;
    if (rule === "*") return "edit";
    return rule[module] || null;
}

/*
    router.get("/", permit("inventory"), controller.list)       // needs view
    router.post("/", permit("inventory"), controller.create)    // POST needs edit (decided from the HTTP method)
    router.use("/orders", authMiddleware, permit("orders"), orderRoutes)
*/
function permit(module) {
    return (req, res, next) => {
        const level = levelOf(req.user && req.user.role, module);

        if (!level) {
            return next(AppError.forbidden("You do not have access to this section."));
        }
        if (WRITE_METHODS.has(req.method) && level !== "edit") {
            return next(AppError.forbidden("You have view-only access here."));
        }
        next();
    };
}

/*
    Live updates (SSE). The activity feed names who did what, so a role only receives that for
    resources it may open. Resources that change stock / batches (orders, production, QC) are still
    sent WITHOUT the activity text to roles that show inventory or finished goods, so their screens refresh.
*/
const RESOURCE_MODULE = {
    products: "products",
    components: "products",
    inventory: "inventory",
    orders: "orders",
    production: "production",
    "quality-control": "qualityControl",
    "finished-goods": "finishedGoods",
    employees: "employees",
    attendance: "attendance"
    // "auth" and "super-admins" are not listed on purpose: super admin only
};

const REFRESH_ONLY = {
    inventory: ["orders", "production", "quality-control", "finished-goods"],
    finishedGoods: ["orders", "production", "quality-control", "inventory"]
};

/* "full" = event with activity, "refresh" = event without activity text, null = nothing */
function eventAccess(role, resource) {
    const module = RESOURCE_MODULE[resource];
    if (role && ACCESS[role] === "*") return "full";
    if (module && levelOf(role, module)) return "full";

    for (const [m, resources] of Object.entries(REFRESH_ONLY)) {
        if (levelOf(role, m) && resources.includes(resource)) return "refresh";
    }
    return null;
}

module.exports = { ACCESS, ROLE_NAMES, LOGIN_ROUTES, levelOf, permit, eventAccess };

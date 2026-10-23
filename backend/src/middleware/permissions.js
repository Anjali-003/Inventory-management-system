const AppError = require("../shared/AppError");

/*
    ROLE PERMISSIONS (backend). Keep in sync with frontend/src/lib/permissions.js

    users.role is a plain string in MySQL. For every module a role gets:
        "edit"  -> GET + POST/PUT/PATCH/DELETE
        "view"  -> GET only (read-only)
        (none)  -> 403
    SUPER_ADMIN ("*") can do everything.

    TO ADD A ROLE LATER (e.g. QUALITY_INSPECTOR): add it to ACCESS below, then to ROLES in
    scripts/create-user.js (it uses ROLE_NAMES from this file, so nothing else to change there).
    Store Manager already has "iqc" / "purchase": "view" for the pages that will come later.
*/
const ACCESS = {
    SUPER_ADMIN: "*",

    // Each of the 3 department roles EDITS its own module(s) and can only VIEW the other two.
    STORE_MANAGER: {
        inventory: "edit",
        inventoryHistory: "edit",
        finishedGoods: "edit",
        // IQC-approved purchases waiting to be accepted into stock
        incomingStock: "edit",
        // "issue these components" requests from approved orders (dashboard)
        notifications: "edit",
        // can look at these, cannot change
        iqc: "view",
        purchase: "view"
    },

    // Marketing Manager: prepares orders and sends them to the Operations Admin
    MARKETING_MANAGER: {
        marketingOrders: "edit",
        notifications: "edit"
    },

    // Operations Admin: reviews the orders that come in (e.g. from marketing): sees what can be built from the
    // current stock, then approves the order and sends the producible list to the Production Manager and the list
    // of missing components to the Purchase Manager (POST /order-approvals/:id/dispatch), or rejects it.
    // Approved orders appear for the Purchase Manager ("approvedOrders").
    // Can also LOOK at (never change) the Store, IQC and Purchase manager pages.
    OPERATIONS_ADMIN: {
        orderApprovals: "edit",
        approvedOrders: "view",
        // store manager pages
        inventory: "view",
        inventoryHistory: "view",
        finishedGoods: "view",
        incomingStock: "view",
        // IQC manager + purchase manager pages
        iqc: "view",
        purchase: "view"
    },

    // Incoming Quality Control manager: edits IQC, views purchase + the store pages
    IQC_MANAGER: {
        iqc: "edit",
        purchase: "view",
        inventory: "view",
        inventoryHistory: "view",
        finishedGoods: "view",
        incomingStock: "view"
    },

    // Purchase department manager: edits purchase, views IQC + the store pages.
    // He can NOT buy anything on his own: a purchase is only accepted for the components the Operations Admin sent
    // on dispatch (POST /purchase checks every line against order_purchase_items). He then marks it received and
    // sends it to IQC.
    PURCHASE_MANAGER: {
        purchase: "edit",
        approvedOrders: "view", // orders approved by the Operations Admin
        iqc: "view",
        inventory: "view",
        inventoryHistory: "view",
        finishedGoods: "view",
        incomingStock: "view"
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
    STORE_MANAGER: "/store-manager/login",
    IQC_MANAGER: "/iqc-manager/login",
    PURCHASE_MANAGER: "/purchase-manager/login",
    OPERATIONS_ADMIN: "/operations-admin/login",
    MARKETING_MANAGER: "/marketing-manager/login"
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
    purchase: "purchase",
    iqc: "iqc",
    "incoming-stock": "incomingStock",
    "marketing-orders": "marketingOrders",
    "order-approvals": "orderApprovals",
    "approved-orders": "approvedOrders",
    employees: "employees",
    attendance: "attendance"
    // "auth" and "super-admins" are not listed on purpose: super admin only
};

const REFRESH_ONLY = {
    inventory: ["orders", "production", "quality-control", "finished-goods", "incoming-stock"],
    finishedGoods: ["orders", "production", "quality-control", "inventory"],
    // incoming goods: each department's screen refreshes when another department moves a purchase along
    purchase: ["iqc", "incoming-stock"],
    iqc: ["purchase", "incoming-stock"],
    incomingStock: ["purchase", "iqc"],
    // an approval decision must refresh the Purchase Manager's "Approved orders" screen (and the other way round)
    // sending an order refreshes the admin's queue; a decision refreshes marketing's list
    orderApprovals: ["approved-orders", "marketing-orders"],
    approvedOrders: ["order-approvals"],
    marketingOrders: ["order-approvals"]
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

/*
    Turns a request like  POST /api/production/5/update-progress  into a readable line:
        { resource: "production", resourceId: 5, action: "update-progress",
          summary: "Update progress — production order #5" }

    Only the method and URL are used. Request bodies are never stored (they can contain passwords).
*/
const LABELS = {
    products: "product",
    components: "component",
    inventory: "inventory item",
    orders: "order",
    production: "production order",
    "quality-control": "QC inspection",
    "finished-goods": "finished goods",
    employees: "employee",
    attendance: "attendance",
    "super-admins": "super admin"
};

const VERBS = { POST: "Created", PUT: "Updated", PATCH: "Updated", DELETE: "Deleted" };

const titleCase = (s) => {
    const t = s.replace(/[-_]+/g, " ").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
};

function describe(method, originalUrl) {
    const path = String(originalUrl).split("?")[0];
    const parts = path.split("/").filter(Boolean); // ["api", "orders", "12", "start"]
    const resource = parts[1] || "unknown";
    const rest = parts.slice(2);

    const idPart = rest.find((p) => /^\d+$/.test(p));
    const actionPart = rest.find((p) => !/^\d+$/.test(p));

    const resourceId = idPart ? Number(idPart) : null;
    const target = `${LABELS[resource] || resource}${resourceId ? ` #${resourceId}` : ""}`;

    let action;
    let summary;

    if (actionPart) {
        action = actionPart;
        summary = `${titleCase(actionPart)} — ${target}`;
    } else {
        const verb = VERBS[method] || method;
        action = verb.toLowerCase();
        summary = `${verb} ${target}`;
    }

    return { resource, resourceId, action: action.slice(0, 100), summary: summary.slice(0, 255) };
}

module.exports = { describe };

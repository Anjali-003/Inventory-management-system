/*
    Turns a request like  POST /api/v1/production/5/update-progress  into a readable line:
        { resource: "production", resourceId: 5, action: "update-progress",
          summary: "Update progress — production order #5" }

    Only the method, the module name and the path AFTER the module are used (so the API prefix, /api or
    /api/v1, never matters). Request bodies are never stored (they can contain passwords).
*/
const LABELS = {
    products: "product",
    components: "component",
    inventory: "inventory item",
    orders: "order",
    production: "production order",
    "quality-control": "QC inspection",
    "finished-goods": "finished goods",
    purchase: "purchase",
    iqc: "purchase",
    "incoming-stock": "purchase",
    employees: "employee",
    attendance: "attendance",
    "super-admins": "super admin"
};

const VERBS = { POST: "Created", PUT: "Updated", PATCH: "Updated", DELETE: "Deleted" };

const titleCase = (s) => {
    const t = s.replace(/[-_]+/g, " ").trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * @param {string} method    HTTP method
 * @param {string} resource  module name the route group is mounted as, e.g. "orders"
 * @param {string} subPath   request path below that module, e.g. "/12/start-production"
 */
function describe(method, resource, subPath = "") {
    const rest = String(subPath).split("?")[0].split("/").filter(Boolean); // ["12", "start-production"]

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

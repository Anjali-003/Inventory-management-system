
/*
  Role based access (frontend side).

  The backend sends the logged-in user from GET /auth/me as:
  { id, name, email, role }

  Roles are created by the backend developer from the terminal.
  There is NO user-management screen here.

  A role is a string stored in users.role. Multiple users can share
  the same role.

  Access levels:
    "edit"  -> Can open the page and use its action buttons.
    "view"  -> Can open the page in read-only mode.
    absent  -> Page is hidden and access is denied.

  TO ADD A LOGIN ROLE:
  Add ROLES, ROLE_LABELS, LOGIN_PORTALS here, then matching ACCESS
  and LOGIN_ROUTES entries on the backend.

  TO ADD A NEW PAGE:
  1. Add its key to MODULE_PATHS.
  2. Add it to Layout.jsx GROUPS with the matching module key.
  3. Wrap its route in <RequireAccess module="moduleKey"> in App.jsx.
  4. Use usePermissions().canEdit("moduleKey") to hide edit buttons.

  NOTE:
  Frontend access controls only affect the UI.
  The backend must enforce the same rules in
  backend/src/middleware/permissions.js.
*/

// Same strings as users.role in the database.
// Keep synchronized with backend/src/middleware/permissions.js.

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STORE_MANAGER: "STORE_MANAGER",
  IQC_MANAGER: "IQC_MANAGER",
  PURCHASE_MANAGER: "PURCHASE_MANAGER",
  PRODUCTION_MANAGER: "PRODUCTION_MANAGER",
  PRODUCTION_ADMIN: "PRODUCTION_ADMIN",
  QUALITY_FG_MANAGER: "QUALITY_FG_MANAGER",
  OPERATIONS_ADMIN: "OPERATIONS_ADMIN",
  MARKETING_MANAGER: "MARKETING_MANAGER",
  HR_MANAGER: "HR_MANAGER",
};

// Human-readable role names for the UI.
export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Store Manager",
  IQC_MANAGER: "IQC Manager",
  PURCHASE_MANAGER: "Purchase Manager",
  PRODUCTION_MANAGER: "Production Manager",
  PRODUCTION_ADMIN: "Production Admin",
  QUALITY_FG_MANAGER: "Quality Control & Finished Goods",
  OPERATIONS_ADMIN: "Operations Admin",
  MARKETING_MANAGER: "Marketing Manager",
  HR_MANAGER: "HR Manager",
};

const norm = (role) => String(role || "").toUpperCase();

/*
  One login page per role.

  path -> frontend login URL
  api  -> matching backend login endpoint

  App.jsx builds the login routes from this list.
*/

export const LOGIN_PORTALS = {
  SUPER_ADMIN: {
    role: "SUPER_ADMIN",
    path: "/login",
    api: "/auth/login",
    title: "Super Admin Login",
  },

  STORE_MANAGER: {
    role: "STORE_MANAGER",
    path: "/store-manager/login",
    api: "/auth/store-manager/login",
    title: "Store Manager Login",
  },

  IQC_MANAGER: {
    role: "IQC_MANAGER",
    path: "/iqc-manager/login",
    api: "/auth/iqc-manager/login",
    title: "IQC Manager Login",
  },

  PURCHASE_MANAGER: {
    role: "PURCHASE_MANAGER",
    path: "/purchase-manager/login",
    api: "/auth/purchase-manager/login",
    title: "Purchase Manager Login",
  },

  PRODUCTION_MANAGER: {
    role: "PRODUCTION_MANAGER",
    path: "/production-manager/login",
    api: "/auth/production-manager/login",
    title: "Production Login",
  },

  PRODUCTION_ADMIN: {
    role: "PRODUCTION_ADMIN",
    path: "/production-admin/login",
    api: "/auth/production-admin/login",
    title: "Production Admin Login",
  },

  QUALITY_FG_MANAGER: {
    role: "QUALITY_FG_MANAGER",
    path: "/quality-fg-manager/login",
    api: "/auth/quality-fg-manager/login",
    title: "Quality Control & Finished Goods Login",
  },

  OPERATIONS_ADMIN: {
    role: "OPERATIONS_ADMIN",
    path: "/operations-admin/login",
    api: "/auth/operations-admin/login",
    title: "Operations Admin Login",
  },

  MARKETING_MANAGER: {
    role: "MARKETING_MANAGER",
    path: "/marketing-manager/login",
    api: "/auth/marketing-manager/login",
    title: "Marketing Manager Login",
  },

  HR_MANAGER: {
    role: "HR_MANAGER",
    path: "/hr-manager/login",
    api: "/auth/hr-manager/login",
    title: "HR Manager Login",
  },
};

export const loginPathFor = (role) =>
  LOGIN_PORTALS[norm(role)]?.path || "/login";

/*
  WHICH ROLE IS THIS TAB WORKING AS?

  The role of a tab is stored in sessionStorage.
  api.js sends it with every request through X-Login-Role.

  Each browser tab can select its own active role.
*/

const ROLE_KEY = "ims_active_role";

export const getActiveRole = () => {
  try {
    const role = sessionStorage.getItem(ROLE_KEY);
    return LOGIN_PORTALS[norm(role)] ? norm(role) : null;
  } catch {
    return null;
  }
};

export const setActiveRole = (role) => {
  try {
    sessionStorage.setItem(ROLE_KEY, norm(role));
  } catch {
    // Ignore sessionStorage errors.
  }
};

export const clearActiveRole = () => {
  try {
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(VIEW_AS_KEY);
  } catch {
    // Ignore sessionStorage errors.
  }
};

/*
  VIEW AS (Super Admin only)

  The CEO can see the app exactly as another role sees it (sidebar, dashboard, buttons) without logging in as that
  role: pick it in the header. It is kept per tab (sessionStorage), so two tabs can show two roles side by side.
  Only the screens change: the server still knows the user as the Super Admin, so whatever is done is done (and
  recorded) as the Super Admin, who may do every role's work anyway.
*/
const VIEW_AS_KEY = "ims_view_as";
const viewAsListeners = new Set();

export const getViewAs = () => {
  try {
    const role = norm(sessionStorage.getItem(VIEW_AS_KEY));
    return role && role !== "SUPER_ADMIN" && ROLES[role] ? role : null;
  } catch {
    return null;
  }
};

export const setViewAs = (role) => {
  try {
    if (role && role !== "SUPER_ADMIN") sessionStorage.setItem(VIEW_AS_KEY, norm(role));
    else sessionStorage.removeItem(VIEW_AS_KEY);
  } catch {
    // Ignore sessionStorage errors.
  }
  viewAsListeners.forEach((fn) => fn());
};

export const subscribeViewAs = (fn) => {
  viewAsListeners.add(fn);
  return () => viewAsListeners.delete(fn);
};

// Called after a successful login on a portal page.
export const rememberPortal = (portal) => {
  if (portal?.role) {
    setActiveRole(portal.role);
  }
};

// Where this tab goes when its session expires.
export const savedLoginPath = () => {
  const role = getActiveRole();
  return role ? loginPathFor(role) : "/";
};

/*
  Module key -> route path.

  The order determines which page a role lands on first
  when homePathFor() selects its first accessible module.
*/

export const MODULE_PATHS = {
  dashboard: "/dashboard",
  activity: "/activity",
  products: "/products",
  production: "/production",
  qcFailed: "/qc-failed",
  inventory: "/inventory",
  inventoryHistory: "/inventory-history",
  orders: "/orders",
  qualityControl: "/quality-control",
  finishedGoods: "/finished-goods",
  incomingStock: "/incoming-stock",
  storeMaterialRequests: "/store-material-requests",
  productStock: "/product-stock",
  orderTracker: "/order-tracker",
  reports: "/reports",
  sales: "/bills",
  customers: "/customers",
  employees: "/employees",
  attendance: "/attendance",

  // IQC and Purchase
  iqc: "/iqc",
  purchase: "/purchase",

  // Marketing and Operations Admin order workflow
  marketingOrders: "/marketing-orders",
  repairRequests: "/repair-requests",
  repairApprovals: "/repair-approvals",
  repairProduction: "/repair-production",
  repairQc: "/repair-qc",
  repairDispatch: "/repair-dispatch",
  orderApprovals: "/order-approvals",
  approvedOrders: "/approved-orders",
};

/*
  ACCESS RULES

  "edit" -> Read and modify.
  "view" -> Read only.
  Missing module -> No access.

  Each role is defined ONCE to avoid duplicate-key overwrites.
*/

const ACCESS = {
  // Full access to every module.
  SUPER_ADMIN: "*",

  // Store Manager owns the store modules. Component stock changes only through its steps
  // (accept from IQC, issue to production, extra material); manual stock in / out is Super Admin only.
  STORE_MANAGER: {
    dashboard: "view",
    orderTracker: "view", // "waiting for you" on the dashboard
    inventory: "view",
    inventoryHistory: "edit",
    finishedGoods: "edit",
    productStock: "view",
    incomingStock: "edit",
    storeMaterialRequests: "edit",

    // Read-only access to other departments.
    iqc: "view",
    purchase: "view",
  },

  // IQC Manager owns IQC and can view related departments.
  // IQC only checks what Purchase sent: no customer orders (no Order Tracker, no order numbers on purchases)
  IQC_MANAGER: {
    dashboard: "view",
    iqc: "edit",
    purchase: "view",
    inventory: "view",
    inventoryHistory: "view",
    incomingStock: "view",
  },

  // Purchase Manager owns Purchase.
  PURCHASE_MANAGER: {
    dashboard: "view",
    orderTracker: "view", // "waiting for you" on the dashboard
    purchase: "edit",
    approvedOrders: "view",
    iqc: "view",
    inventory: "view",
    inventoryHistory: "view",
    incomingStock: "view",
  },

  // Production Manager handles production.
  PRODUCTION_MANAGER: {
    dashboard: "view",
    repairProduction: "edit",
    orderTracker: "view", // "waiting for you" on the dashboard
    production: "edit",
    qcFailed: "edit",
    // can only LOOK at Store's stock; extra material is asked from the Production page
    inventory: "view",
    qualityControl: "view",
    finishedGoods: "view",
    productStock: "view",
  },

  // Production Admin oversees the production-to-release workflow and component stock.
  // Store handover itself remains a Store Manager action; this role can create requests from Production.
  PRODUCTION_ADMIN: {
    dashboard: "view",
    repairApprovals: "edit",
    repairProduction: "edit",
    repairQc: "edit",
    repairDispatch: "edit",
    production: "edit",
    qualityControl: "edit",
    qcFailed: "edit",
    finishedGoods: "edit",
    inventory: "edit",
    materialRequests: "edit",
    customers: "edit",
  },

  // Quality Control & Finished Goods workspace.
  QUALITY_FG_MANAGER: {
    dashboard: "view",
    repairQc: "edit",
    repairDispatch: "edit",
    orderTracker: "view", // "waiting for you" on the dashboard
    qualityControl: "edit",
    finishedGoods: "view",
    qcFailed: "edit",
    production: "view",
    productStock: "view",
  },

  // Marketing Manager prepares orders for Operations Admin.
  MARKETING_MANAGER: {
    dashboard: "view",
    repairRequests: "edit",
    marketingOrders: "edit",
    // makes the bill and confirms delivery
    finishedGoods: "edit",
    productStock: "view",
    customers: "edit",
    sales: "view",
    orderTracker: "view",
  },

  // HR owns employee records and attendance.
  HR_MANAGER: {
    dashboard: "view",
    employees: "edit",
    attendance: "edit",
  },

  // Operations Admin reviews and approves orders.
  OPERATIONS_ADMIN: {
    dashboard: "view",
    orderApprovals: "edit",
    approvedOrders: "view",

    // Read-only access to store modules.
    inventory: "view",
    inventoryHistory: "view",
    incomingStock: "view",
    // hands packed goods over to the Store
    finishedGoods: "view",
    productStock: "view",
    orderTracker: "view",
    reports: "view",
    sales: "view",
    customers: "view",

    // Read-only access to IQC and Purchase.
    iqc: "view",
    purchase: "view",
  },
};

// Returns the access level for a role and module.
const levelOf = (role, module) => {
  const rule = ACCESS[norm(role)];

  // Unknown roles have no access.
  if (!rule) return null;

  // Super Admin can edit every module.
  if (rule === "*") return "edit";

  return rule[module] || null;
};

// Can the role open this module?
export const canView = (role, module) =>
  levelOf(role, module) !== null;

// Can the role modify this module?
export const canEdit = (role, module) =>
  levelOf(role, module) === "edit";

/*
  First page this role lands on:

  1. Dashboard, if accessible.
  2. Otherwise, the first module it can edit.
  3. Otherwise, the first module it can view.
  4. Null if it has no accessible modules.
*/

export const homePathFor = (role) => {
  if (canView(role, "dashboard")) {
    return MODULE_PATHS.dashboard;
  }

  const keys = Object.keys(MODULE_PATHS);

  const module =
    keys.find((key) => canEdit(role, key)) ||
    keys.find((key) => canView(role, key));

  return module ? MODULE_PATHS[module] : null;
};

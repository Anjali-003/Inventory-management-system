/*
  Role based access (frontend side).

  The backend sends the logged-in user from GET /auth/me as { id, name, email, role }.
  Roles are created by the backend developer from the terminal, so there is NO user-management screen here.
  A role is just a string stored in users.role. Several users can share the same role
  (e.g. 3 store managers = 3 users with role "STORE_MANAGER").

  Every page is a "module". For each role we say, per module:
      "edit"  -> can open the page AND use its buttons (stock in/out, dispatch ...)
      "view"  -> can open the page but every action button is hidden (read only)
      (absent) -> page is hidden from the sidebar and the route redirects away

  TO ADD A NEW ROLE LATER: add one entry in ACCESS below (and its label in ROLE_LABELS). Nothing else.
  TO ADD A NEW PAGE LATER (e.g. IQC, Purchase): add the module key to MODULE_PATHS, put the page in
  Layout.jsx GROUPS with `module: "iqc"`, wrap its <Route> in <RequireAccess module="iqc"> in App.jsx,
  and use usePermissions().canEdit("iqc") inside the page to hide edit buttons.
  Store Manager already has "iqc: view" and "purchase: view" below, so those pages will be read-only for them automatically.

  NOTE: this only controls what the UI shows. The backend enforces the same rules in backend/src/middleware/permissions.js (keep both in sync).
*/

// Same strings as users.role in the database (uppercase). Keep in sync with backend/src/middleware/permissions.js
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STORE_MANAGER: "STORE_MANAGER",
}

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Store Manager",
}

const norm = (role) => String(role || "").toUpperCase()

/*
  One login page per role. `path` is the page in the browser, `api` is the matching backend endpoint
  (LOGIN_ROUTES in backend/src/middleware/permissions.js). App.jsx builds the /login routes from this list.
*/
export const LOGIN_PORTALS = {
  SUPER_ADMIN: { role: "SUPER_ADMIN", path: "/login", api: "/auth/login", title: "Super Admin Login" },
  STORE_MANAGER: { role: "STORE_MANAGER", path: "/store-manager/login", api: "/auth/store-manager/login", title: "Store Manager Login" },
}

export const loginPathFor = (role) => LOGIN_PORTALS[norm(role)]?.path || "/login"

// remembers which login page this browser used, so "session expired" sends the user back to THEIR page
const PORTAL_KEY = "ims_login_portal"
export const rememberPortal = (portal) => { try { localStorage.setItem(PORTAL_KEY, portal.path) } catch { /* ignore */ } }
export const savedLoginPath = () => {
  try {
    const p = localStorage.getItem(PORTAL_KEY)
    return Object.values(LOGIN_PORTALS).some((x) => x.path === p) ? p : "/login"
  } catch { return "/login" }
}

// module key -> route path. The ORDER here decides which page a user lands on first (see homePathFor).
export const MODULE_PATHS = {
  dashboard: "/",
  activity: "/activity",
  products: "/products",
  inventory: "/inventory",
  inventoryHistory: "/inventory-history",
  orders: "/orders",
  production: "/production",
  qualityControl: "/quality-control",
  finishedGoods: "/finished-goods",
  employees: "/employees",
  attendance: "/attendance",
  // future pages (not built yet)
  iqc: "/iqc",
  purchase: "/purchase",
}

const ACCESS = {
  SUPER_ADMIN: "*", // everything, editable

  STORE_MANAGER: {
    inventory: "edit",
    inventoryHistory: "edit",
    finishedGoods: "edit",
    // future: can look at these but never change anything
    iqc: "view",
    purchase: "view",
  },
}

const levelOf = (role, module) => {
  const rule = ACCESS[norm(role)]
  if (!rule) return null // unknown role -> no access at all
  if (rule === "*") return "edit"
  return rule[module] || null
}

export const canView = (role, module) => levelOf(role, module) !== null
export const canEdit = (role, module) => levelOf(role, module) === "edit"

// first page this role is allowed to open (null when the role has no module at all)
export const homePathFor = (role) => {
  const m = Object.keys(MODULE_PATHS).find((k) => canView(role, k))
  return m ? MODULE_PATHS[m] : null
}

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
  TO ADD A NEW PAGE LATER: add the module key to MODULE_PATHS, put the page in
  Layout.jsx GROUPS with `module: "iqc"`, wrap its <Route> in <RequireAccess module="iqc"> in App.jsx,
  and use usePermissions().canEdit("iqc") inside the page to hide edit buttons.
  IQC_MANAGER owns "iqc", PURCHASE_MANAGER owns "purchase", STORE_MANAGER owns the store pages (inventory, inventory history, finished goods, incoming stock).
  Every one of these 3 roles has "view" on the other two departments' pages, so those pages open read-only for them automatically.

  NOTE: this only controls what the UI shows. The backend enforces the same rules in backend/src/middleware/permissions.js (keep both in sync).
*/

// Same strings as users.role in the database (uppercase). Keep in sync with backend/src/middleware/permissions.js
//program mein comparison aur logic ke liye.
// code aur role checks ke liye ek consistent identifier.
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STORE_MANAGER: "STORE_MANAGER",
  IQC_MANAGER: "IQC_MANAGER",
  PURCHASE_MANAGER: "PURCHASE_MANAGER",
}

//user ko readable naam dikhane ke liye.
export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  STORE_MANAGER: "Store Manager",
  IQC_MANAGER: "IQC Manager",
  PURCHASE_MANAGER: "Purchase Manager",
}

const norm = (role) => String(role || "").toUpperCase()

/*
  One login page per role. `path` is the page in the browser, `api` is the matching backend endpoint
  (LOGIN_ROUTES in backend/src/middleware/permissions.js). App.jsx builds the /login routes from this list.
*/
export const LOGIN_PORTALS = {
  SUPER_ADMIN: { role: "SUPER_ADMIN", path: "/login", api: "/auth/login", title: "Super Admin Login" },
  STORE_MANAGER: { role: "STORE_MANAGER", path: "/store-manager/login", api: "/auth/store-manager/login", title: "Store Manager Login" },
  IQC_MANAGER: { role: "IQC_MANAGER", path: "/iqc-manager/login", api: "/auth/iqc-manager/login", title: "IQC Manager Login" },
  PURCHASE_MANAGER: { role: "PURCHASE_MANAGER", path: "/purchase-manager/login", api: "/auth/purchase-manager/login", title: "Purchase Manager Login" },
}

export const loginPathFor = (role) => LOGIN_PORTALS[norm(role)]?.path || "/login"

/*
  WHICH ROLE IS THIS TAB WORKING AS?
  Every role has its own login cookie on the server, so all four roles can be logged in at once.
  The role of a tab is kept in sessionStorage (private to the tab), and api.js sends it with every
  request as the X-Login-Role header. Result: tab 1 = Super Admin, tab 2 = Store Manager, and so on.
  A brand new tab has no role yet: the landing page lets the user continue as one of the logged-in roles.
*/
const ROLE_KEY = "ims_active_role"
export const getActiveRole = () => {
  try {
    const r = sessionStorage.getItem(ROLE_KEY)
    return LOGIN_PORTALS[norm(r)] ? norm(r) : null
  } catch { return null }
}
export const setActiveRole = (role) => { try { sessionStorage.setItem(ROLE_KEY, norm(role)) } catch { /* ignore */ } }
export const clearActiveRole = () => { try { sessionStorage.removeItem(ROLE_KEY) } catch { /* ignore */ } }

// called after a successful login on a portal page
export const rememberPortal = (portal) => setActiveRole(portal.role)

// where "session expired" sends this tab: its own login page, or the landing page when the tab has no role yet
export const savedLoginPath = () => {
  const role = getActiveRole()
  return role ? loginPathFor(role) : "/"
}

// module key -> route path. The ORDER here decides which page a user lands on first (see homePathFor).
export const MODULE_PATHS = {
  dashboard: "/dashboard",
  activity: "/activity",
  products: "/products",
  inventory: "/inventory",
  inventoryHistory: "/inventory-history",
  orders: "/orders",
  production: "/production",
  qualityControl: "/quality-control",
  finishedGoods: "/finished-goods",
  incomingStock: "/incoming-stock", // IQC-approved purchases the store manager accepts into stock
  employees: "/employees",
  attendance: "/attendance",
  // IQC dashboard and Purchase page (see features/iqc and features/purchase)
  iqc: "/iqc",
  purchase: "/purchase",
}

const ACCESS = {
  SUPER_ADMIN: "*", // everything, editable

  STORE_MANAGER: {
    inventory: "edit",
    inventoryHistory: "edit",
    finishedGoods: "edit",
    incomingStock: "edit", // accepts IQC-approved purchases into inventory
    // can look at these but never change anything
    iqc: "view",
    purchase: "view",
  },

  // edits IQC; views purchase + the store pages
  IQC_MANAGER: {
    iqc: "edit",
    purchase: "view",
    inventory: "view",
    inventoryHistory: "view",
    finishedGoods: "view",
    incomingStock: "view",
  },

  // edits purchase; views IQC + the store pages
  PURCHASE_MANAGER: {
    purchase: "edit",
    iqc: "view",
    inventory: "view",
    inventoryHistory: "view",
    finishedGoods: "view",
    incomingStock: "view",
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

// first page this role lands on (null when the role has no module at all).
// A page the role can EDIT wins over a view-only one, so the IQC manager lands on /iqc (not on /inventory,
// which comes earlier in MODULE_PATHS but is read-only for them).
export const homePathFor = (role) => {
  const keys = Object.keys(MODULE_PATHS)
  const m = keys.find((k) => canEdit(role, k)) || keys.find((k) => canView(role, k))
  return m ? MODULE_PATHS[m] : null
}

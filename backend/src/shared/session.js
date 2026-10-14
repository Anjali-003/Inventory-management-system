const env = require("../config/env");
const { ROLE_NAMES } = require("../middleware/permissions");

/*
    One login cookie PER ROLE, so a store manager, an IQC manager, a purchase manager and a super admin
    can all be logged in at the same time in the same browser (one role per tab).

        super admin       -> cookie "access_token_super_admin"
        store manager     -> cookie "access_token_store_manager"   ...

    Which cookie a request uses is decided by the role the TAB says it is working as:
        header  X-Login-Role: STORE_MANAGER          (every axios request, see frontend/src/api/api.js)
        query   ?role=STORE_MANAGER                  (GET only: EventSource cannot send headers)

    The role is only a SELECTOR. The token inside that cookie must have been issued for the same role and
    the user must still have that role in the database (authMiddleware checks both), so sending another
    role's name never gives access to it.
*/
const ROLE_HEADER = "x-login-role";

const cookieNameFor = (role) => `${env.cookie.name}_${String(role).toLowerCase()}`;

/** The role this request wants to act as, or null when it is missing / not a known role. */
function roleFromRequest(req) {
    const raw = req.get(ROLE_HEADER) || (req.method === "GET" ? req.query && req.query.role : "");
    const role = String(raw || "").trim().toUpperCase();
    return ROLE_NAMES.includes(role) ? role : null;
}

module.exports = { ROLE_HEADER, cookieNameFor, roleFromRequest };

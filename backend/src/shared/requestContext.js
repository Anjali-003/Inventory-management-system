const { AsyncLocalStorage } = require("node:async_hooks");

/*
    A little information about the request in progress, readable deep inside the services without passing it along.
    Today only one thing: the "View as" role the Super Admin's tab is working in (X-View-As header, sent by
    frontend/src/api/api.js). notification.service uses it to send the next role's notification to that Super Admin
    too, so he can follow the order from role to role. It is only a hint: whoever reads it still checks the user.
*/
const VIEW_AS_HEADER = "x-view-as";
const storage = new AsyncLocalStorage();

function middleware(req, res, next) {
    const viewAs = String(req.get(VIEW_AS_HEADER) || "").trim().toUpperCase();
    storage.run({ viewAs: /^[A-Z_]{1,40}$/.test(viewAs) ? viewAs : null }, next);
}

/* the "View as" role of the request being handled, or null (no request, or not viewing as anyone) */
const viewAs = () => storage.getStore()?.viewAs || null;

module.exports = { middleware, viewAs };

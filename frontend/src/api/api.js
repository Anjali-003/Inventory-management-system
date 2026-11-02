/*
  The one axios instance every request goes through (cookies, base URL, mock mode).

  Do not import this in components. Use a feature service (<department>/<feature>/<name>Service.js)
  for one-off requests, or an RTK Query endpoint (<department>/<feature>/<name>Api.js) for data shown on screens.
*/
import axios from "axios";
import { isMock, resolveApiUrl } from "@/config/env";
import { getActiveRole, getViewAs, isSuperAdminViewOnly } from "@/lib/permissions";

export { DATA_MODE, isMock } from "@/config/env";

const api = axios.create({
  baseURL: resolveApiUrl(),
  withCredentials: true,
  // mock mode: swap the HTTP transport for the in-browser mock (loaded lazily, only in mock mode)
  ...(isMock && {
    adapter: (config) => import("./mock/mockAdapter.js").then((m) => m.mockAdapter(config)),
  }),
});

// tell the server which role (= which login cookie) this tab is working as; a caller may set its own header
export const ROLE_HEADER = "X-Login-Role";
// the Super Admin's "View as" role: the server then also sends him what the next role is told (only a hint, the
// server checks he is a Super Admin)
const VIEW_AS_HEADER = "X-View-As";
api.interceptors.request.use((config) => {
  const method = String(config.method || "get").toLowerCase();
  const requestPath = String(config.url || "").split("?")[0].replace(/\/+$/, "");
  const isWriteRequest = ["post", "put", "patch", "delete"].includes(method);
  const isSessionOrPushRequest =
    requestPath.includes("/auth/") || requestPath.includes("/push/");

  // A shared guard covers both direct Axios services and RTK Query mutations.
  // Reads, navigation, filters and refresh requests remain available in View Only.
  if (isWriteRequest && !isSessionOrPushRequest && isSuperAdminViewOnly()) {
    const error = new Error("View Only is active. Switch to Edit Mode to make changes.");
    error.code = "SUPER_ADMIN_VIEW_ONLY";
    error.config = config;
    error.response = {
      status: 423,
      data: { message: error.message, code: error.code },
      config,
    };
    return Promise.reject(error);
  }

  const role = getActiveRole();
  if (role && !config.headers.get(ROLE_HEADER)) config.headers.set(ROLE_HEADER, role);
  const viewAs = getViewAs();
  if (viewAs) config.headers.set(VIEW_AS_HEADER, viewAs);
  return config;
});

export default api;

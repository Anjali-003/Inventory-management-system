import api from "@/api/api";

/* One-off auth requests. The cached "who am I" lives in authApi.js (useGetMeQuery). */
export const authService = {
  /** @param {string} loginPath portal endpoint, e.g. "/auth/login" (see LOGIN_PORTALS) */
  login: (loginPath, { email, password }) => api.post(loginPath, { email, password }),
  logout: () => api.post("/auth/logout"),
  /** Resolves when the login cookie is valid, rejects with 401 otherwise. */
  checkSession: () => api.get("/auth/me"),
};

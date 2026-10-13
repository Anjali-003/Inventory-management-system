/**
 * The ONLY place in the frontend that reads import.meta.env.
 * Everything else imports from here. See frontend/.env.example.
 *
 *   VITE_DATA_MODE   "mysql" (default) = real backend, "mock" = answered in the browser from src/api/mock/*
 *   VITE_API_URL     full API base URL; leave empty in development (derived from the address the app was opened on)
 *
 * Vite only exposes variables that start with VITE_ to the browser. Restart `npm run dev` after editing .env.
 */

/** Current API version path. Must match API_VERSION_PREFIX in backend/src/app.js. */
export const API_PREFIX = "/api/v1";

/** Port the backend listens on in development (backend PORT). */
const DEV_API_PORT = 5000;
/** Port the Vite dev server uses (frontend/vite.config.js). */
const DEV_APP_PORT = 5173;

export const DATA_MODE = String(import.meta.env.VITE_DATA_MODE || "mysql").trim().toLowerCase();
export const isMock = DATA_MODE === "mock";

/**
 * Resolves the backend URL:
 *  1. VITE_API_URL when set (production);
 *  2. VS Code / GitHub dev tunnels, where the port is part of the host name (...-5173.x -> ...-5000.x);
 *  3. otherwise the same host the app was opened on, on the backend port (works on localhost and on the LAN).
 */
export function resolveApiUrl(location = window.location) {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  const { hostname, protocol } = location;

  if (hostname.endsWith(".devtunnels.ms")) {
    const backendHost = hostname.replace(`-${DEV_APP_PORT}.`, `-${DEV_API_PORT}.`);
    return `${protocol}//${backendHost}${API_PREFIX}`;
  }

  return `${protocol}//${hostname}:${DEV_API_PORT}${API_PREFIX}`;
}

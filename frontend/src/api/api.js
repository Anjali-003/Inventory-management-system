// Frontend jis URL se open hua hai, us URL ko dekhkar automatically backend ka URL banana.
// Isliye .env mein baar-baar VITE_API_URL change/comment nahi karna padega.
//
// DATA MODE (frontend/.env):
//   VITE_DATA_MODE=mysql   -> normal: real backend + MySQL (default when the variable is missing)
//   VITE_DATA_MODE=mock    -> mock: every request is answered in the browser from src/api/mock/*,
//                             the backend and the database are not touched at all.
// Vite sirf VITE_ se shuru hone wale variables browser tak pahunchata hai, isliye naam VITE_DATA_MODE hai.
// .env badalne ke baad dev server (npm run dev) restart karna zaroori hai.

import axios from "axios";

export const DATA_MODE = String(import.meta.env.VITE_DATA_MODE || "mysql").trim().toLowerCase();
export const isMock = DATA_MODE === "mock";

const getApiUrl = () => {
  const { hostname, protocol } = window.location;

  // Production: VITE_API_URL provided
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  //for port forwarding
  if (hostname.endsWith(".devtunnels.ms")) {
    const backendHost = hostname.replace("-5173.", "-5000.");
    return `${protocol}//${backendHost}/api`;
  }

  //for local development
  return `${protocol}//${hostname}:5000/api`;
};

const api = axios.create({
  baseURL: getApiUrl(),
  withCredentials: true,
  // mock mode: swap the HTTP transport for the in-browser mock (loaded lazily, only in mock mode)
  ...(isMock && {
    adapter: (config) => import("./mock/mockAdapter.js").then((m) => m.mockAdapter(config)),
  }),
});

export default api;

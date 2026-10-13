/*
  The one axios instance every request goes through (cookies, base URL, mock mode).

  Do not import this in components. Use a feature service (features/<name>/<name>Service.js)
  for one-off requests, or an RTK Query endpoint (features/<name>/<name>Api.js) for data shown on screens.
*/
import axios from "axios";
import { isMock, resolveApiUrl } from "@/config/env";

export { DATA_MODE, isMock } from "@/config/env";

const api = axios.create({
  baseURL: resolveApiUrl(),
  withCredentials: true,
  // mock mode: swap the HTTP transport for the in-browser mock (loaded lazily, only in mock mode)
  ...(isMock && {
    adapter: (config) => import("./mock/mockAdapter.js").then((m) => m.mockAdapter(config)),
  }),
});

export default api;

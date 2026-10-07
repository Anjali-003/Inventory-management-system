/*
  Axios adapter for mock mode: instead of sending an HTTP request it asks mockRouter for the answer
  and returns it the way axios would (2xx resolves, 4xx/5xx rejects with error.response).
  Loaded lazily from api.js, so this code never reaches a normal (mysql-mode) build's main bundle.
*/
import { AxiosError } from "axios"
import { handleMock } from "./mockRouter"

const DELAY_MS = 120 // small delay so loading skeletons / spinners are visible, like a real server

let badgeShown = false
function showBadge() {
  if (badgeShown || typeof document === "undefined") return
  badgeShown = true
  const el = document.createElement("div")
  el.textContent = "MOCK DATA"
  el.title = "VITE_DATA_MODE=mock - nothing is read from or written to MySQL"
  el.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:99999;padding:3px 9px;border-radius:999px;font:600 11px/1.6 system-ui,sans-serif;" +
    "letter-spacing:.06em;color:#7c2d12;background:#fed7aa;border:1px solid #fb923c;pointer-events:none;opacity:.92"
  document.body.appendChild(el)
  console.info("%c[mock] frontend mock data is ON (VITE_DATA_MODE=mock). MySQL is not used.", "color:#c2410c;font-weight:bold")
}

const parseBody = (data) => {
  if (data == null || data === "") return {}
  if (typeof data === "string") { try { return JSON.parse(data) } catch { return {} } }
  return data
}

export function mockAdapter(config) {
  showBadge()
  const url = String(config.url || "")
  const [path, search = ""] = url.split("?")
  const params = { ...Object.fromEntries(new URLSearchParams(search)), ...(config.params || {}) }
  Object.keys(params).forEach((k) => params[k] === undefined && delete params[k])
  const body = parseBody(config.data)

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const { status, data } = handleMock(config.method, path, params, body)
      const response = {
        data: JSON.parse(JSON.stringify(data ?? null)), // fresh copy, like a real JSON response
        status,
        statusText: status < 400 ? "OK" : "Error",
        headers: {},
        config,
        request: {},
      }
      if (status >= 200 && status < 300) resolve(response)
      else reject(new AxiosError(`Request failed with status code ${status}`, status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST", config, response.request, response))
    }, DELAY_MS)
  })
}

import api from "@/api/api"

/*
  Phone / desktop notifications (Web Push) for the role this tab is logged in as.
    pushState()     "unsupported" | "disabled" (server has no keys) | "blocked" (user said no) | "off" | "on"
    enablePush()    asks the browser's permission, subscribes and tells the server
    disablePush()   stops them for this role on this browser (other roles logged in here keep theirs)
  Browsers allow push only on https or http://localhost. The service worker is public/sw.js.
*/
const SW_URL = "/sw.js"

export const pushSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window

const registration = () => navigator.serviceWorker.register(SW_URL)

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration(SW_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

// the VAPID public key comes as base64url; PushManager wants the raw bytes
function keyBytes(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

// last known: does this browser get this role's phone / desktop notifications? (LiveSync then skips the same toast)
let on = false
export const pushOn = () => on && pushSupported() && Notification.permission === "granted"

export async function pushState() {
  const state = await readPushState()
  on = state === "on"
  return state
}

async function readPushState() {
  if (!pushSupported()) return "unsupported"
  const { data: cfg } = await api.get("/push/config")
  if (!cfg?.enabled) return "disabled"
  if (Notification.permission === "denied") return "blocked"
  const sub = await currentSubscription()
  if (!sub || Notification.permission !== "granted") return "off"
  const { data } = await api.get("/push/status", { params: { endpoint: sub.endpoint } })
  return data?.subscribed ? "on" : "off"
}

export async function enablePush() {
  const { data: cfg } = await api.get("/push/config")
  if (!cfg?.enabled) throw new Error("Push notifications are not set up on the server.")
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in the browser's site settings.")

  const reg = await registration()
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) })
  await api.post("/push/subscribe", { subscription: sub.toJSON() })
  on = true
}

/* For this role only; the browser subscription stays for the other roles logged in here. Never throws. */
export async function disablePush() {
  on = false
  try {
    if (!pushSupported()) return
    const sub = await currentSubscription()
    if (sub) await api.post("/push/unsubscribe", { endpoint: sub.endpoint })
  } catch {
    // logging out must not fail because of this
  }
}

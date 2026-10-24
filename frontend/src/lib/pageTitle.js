/*
  The browser tab title, made of two parts that change independently:
    setPageTitle("Incoming orders")  the page you are on   (TitleSync in App.jsx, on every route change)
    setUnreadCount(3)                unread notifications  (NotificationBell)
  -> "(3) Incoming orders · Sensation Systems". Keeping both here means neither can overwrite the other.
*/
const APP = "Sensation Systems"
let page = null
let unread = 0

function render() {
  if (typeof document === "undefined") return
  const name = page ? `${page} · ${APP}` : APP
  document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${name}` : name
}

export function setPageTitle(title) {
  page = title || null
  render()
}

export function setUnreadCount(count) {
  unread = Number(count) || 0
  render()
}

/*
  Service worker for phone / desktop notifications (Web Push).
  The backend pushes { id, type, title, body, link, severity, role } for every new notification of the role this
  browser turned push on for, and it is always shown as a system notification: one browser is often logged in as
  several roles, so an app tab in front may belong to another role and must not hide it. A click opens the
  notification's page, in the right workspace (?as=ROLE). One the Super Admin got while working in "View as" also
  carries viewAs: the click opens it viewing as that role (?view=ROLE).
*/
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data ? event.data.text() : "" }
  }

  event.waitUntil(show(data))
})

/*
  One notification can arrive twice in a browser logged in as two roles: once for the role it is for, once for the
  Super Admin following the order in "View as" (it carries viewAs). Both use the same tag, so the later one replaces
  the earlier; the "View as" one always wins, so a click keeps the Super Admin in his own login.
*/
async function show(data) {
  const tag = data.id ? `notification-${data.id}` : undefined
  const [shown] = tag ? await self.registration.getNotifications({ tag }) : []
  if (shown?.data?.viewAs && !data.viewAs) return
  // the two arrive in either order; a replacement is silent unless renotify, and Windows then hides the first popup
  // too, so the "View as" one that replaces the role's own pops up again
  const renotify = !!shown
  return self.registration.showNotification(data.title || "Sensation Systems", {
      body: data.body || "",
      icon: "/ss_logo.png",
      badge: "/ss_logo.png",
      tag,
      renotify,
      requireInteraction: data.severity === "action", // a task stays on screen until it is looked at
      data: { link: data.link || "/dashboard", role: data.role || "", viewAs: data.viewAs || "" },
    })
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const { link = "/dashboard", role = "", viewAs = "" } = event.notification.data || {}
  const url = new URL(link, self.location.origin)
  if (role) url.searchParams.set("as", role) // the new tab works as the role the notification is for
  if (viewAs) url.searchParams.set("view", viewAs) // the Super Admin following an order: "View as" the role whose turn it is
  event.waitUntil(self.clients.openWindow(url.href))
})

/*
  Service worker for phone / desktop notifications (Web Push).
  The backend pushes { id, type, title, body, link, severity, role } for every new notification of the role this
  browser turned push on for, and it is always shown as a system notification: one browser is often logged in as
  several roles, so an app tab in front may belong to another role and must not hide it. A click opens the
  notification's page, in the right workspace (?as=ROLE).
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

  event.waitUntil(
    self.registration.showNotification(data.title || "Sensation Systems", {
      body: data.body || "",
      icon: "/ss_logo.png",
      badge: "/ss_logo.png",
      tag: data.id ? `notification-${data.id}` : undefined,
      requireInteraction: data.severity === "action", // a task stays on screen until it is looked at
      data: { link: data.link || "/dashboard", role: data.role || "" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const { link = "/dashboard", role = "" } = event.notification.data || {}
  const url = new URL(link, self.location.origin)
  if (role) url.searchParams.set("as", role) // the new tab works as the role the notification is for
  event.waitUntil(self.clients.openWindow(url.href))
})

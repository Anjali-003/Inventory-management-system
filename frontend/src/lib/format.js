const pad = (n) => String(n).padStart(2, "0")

/** Today as YYYY-MM-DD in the browser's local time zone. */
export const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const shiftDate = (s, days) => {
  const [y, m, d] = s.split("-").map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export const shiftMonth = (s, n) => {
  const [y, m] = s.split("-").map(Number)
  const dt = new Date(y, m - 1 + n, 1)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`
}

export const longDate = (s) =>
  new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })

export const shortDate = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-"

export const monthLabel = (s) =>
  new Date(`${s}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })

/** "09:30" -> 570. Returns null for empty / invalid input. */
export const toMinutes = (t) => {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

export const fromMinutes = (mins) => {
  const c = Math.max(0, Math.min(23 * 60 + 59, mins))
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`
}

export const nowMinutes = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** 462 -> "7h 42m", 45 -> "45m" */
export const formatDuration = (mins) => {
  if (mins == null || Number.isNaN(mins) || mins < 0) return "-"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h === 0 ? `${m}m` : `${h}h ${pad(m)}m`
}

export const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"

export const firstName = (name = "") => name.trim().split(/\s+/)[0] || "Employee"

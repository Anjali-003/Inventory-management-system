import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Bell, CheckCheck, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { setUnreadCount } from "@/lib/pageTitle"
import { timeAgo } from "@/features/activity/time"
import { severityOf } from "./notificationStyle"
import NotificationIcon from "./NotificationIcon"
import { usePermissions } from "@/features/auth/usePermissions"
import { ROLE_LABELS, setViewAs } from "@/lib/permissions"
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "./notificationsApi"

/*
  Header bell: the inbox of the logged-in role.
    - red badge = unread for THIS user (open tasks count until someone of the role completes them)
    - "Action needed" lists open tasks first, then everything else newest first
    - clicking a notification marks it read and opens its page (link)
  The list refreshes live (LiveSync invalidates "Notifications" on every "notify" event).
  The Super Admin (CEO) gets EVERY department's notifications here, read only: each row says whose inbox it is and
  who sent it, "Important" keeps the ones that also ring the phone, and a department can be picked.
*/
const EMPTY = { items: [], unread: 0 }
const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
]

export default function NotificationBell() {
  const navigate = useNavigate()
  const { realRole, viewingAs } = usePermissions()
  const ceo = realRole === "SUPER_ADMIN"
  const [dept, setDept] = useState("")
  const { data = EMPTY } = useGetNotificationsQuery()
  const [markRead] = useMarkNotificationReadMutation()
  const [markAllRead] = useMarkAllNotificationsReadMutation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("all")
  const rootRef = useRef(null)

  const { unread } = data
  const visible = useMemo(() => data.items.filter((n) =>
    (tab !== "unread" || !n.read) && (tab !== "important" || n.important) && (!dept || n.for_role === dept)
  ), [data.items, tab, dept])
  // the CEO only reads other roles' tasks (that role closes them), so they are not "Action needed" for it
  const tasks = ceo ? [] : visible.filter((n) => n.requires_action && !n.done)
  const rest = ceo ? visible : visible.filter((n) => !(n.requires_action && !n.done))
  const depts = useMemo(() => [...new Set(data.items.map((n) => n.for_role).filter(Boolean))].sort(), [data.items])
  const tabs = ceo ? [...TABS, { id: "important", label: "Important" }] : TABS

  // "(3) Incoming orders · Sensation Systems": the count shows in the browser tab too (lib/pageTitle.js)
  useEffect(() => {
    setUnreadCount(unread)
    return () => setUnreadCount(0)
  }, [unread])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const openItem = (n) => {
    if (!n.read) markRead(n.id)
    setOpen(false)
    // the Super Admin in "View as": opening another role's notification switches the view to that role
    if (viewingAs && n.for_role && n.for_role !== "SUPER_ADMIN") setViewAs(n.for_role)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative grid size-9 place-items-center rounded-lg text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30",
          open && "bg-muted"
        )}
      >
        <Bell className="size-[18px]" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white tabular-nums"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-x-2 top-16 z-50 flex max-h-[calc(100vh-5rem)] origin-top-right flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-[0_20px_48px_-12px_rgba(22,34,30,0.28)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[400px] sm:max-h-[min(560px,calc(100vh-5rem))]"
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 pb-2 pt-3.5">
              <div>
                <p className="text-sm font-bold">Notifications</p>
                <p className="text-[11px] text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
              </div>
              <button
                type="button"
                disabled={!unread}
                onClick={() => markAllRead()}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
              >
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            </div>

            <div role="tablist" className="flex gap-1 border-b px-3 py-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
                    tab === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {t.label}
                  {t.id === "unread" && unread > 0 && <span className="ml-1 tabular-nums opacity-70">{unread}</span>}
                </button>
              ))}
              {ceo && depts.length > 0 && (
                <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}
                  className="ml-auto h-7 rounded-full border bg-card px-2 text-xs font-semibold text-muted-foreground">
                  <option value="">All departments</option>
                  {depts.map((d) => <option key={d} value={d}>{ROLE_LABELS[d] || d}</option>)}
                </select>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Inbox className="size-5" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">{tab === "unread" ? "No unread notifications" : "No notifications yet"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Updates from other departments will show up here.</p>
                </div>
              ) : (
                <>
                  {tasks.length > 0 && <Section label="Action needed" items={tasks} onOpen={openItem} />}
                  {rest.length > 0 && <Section label={tasks.length ? "Earlier" : null} items={rest} onOpen={openItem} ceo={ceo} />}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Section({ label, items, onOpen, ceo = false }) {
  return (
    <div>
      {label && <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.6px] text-cf-faint">{label}</p>}
      <ul className="py-1">
        {items.map((n) => (
          <li key={n.id}>
            <NotificationRow n={n} onOpen={() => onOpen(n)} ceo={ceo} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function NotificationRow({ n, onOpen, ceo }) {
  const s = severityOf(n)
  const meta = n.done
    ? `Completed${n.done_by_name ? ` by ${n.done_by_name}` : ""} · ${timeAgo(n.done_at)}`
    : `${timeAgo(n.created_at)}${n.created_by_name ? ` · ${n.created_by_name}` : ""}`

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:bg-muted/70",
        !n.read && "bg-accent/40"
      )}
    >
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", n.done ? "bg-muted text-muted-foreground" : `${s.soft} ${s.tone}`)}>
        <NotificationIcon n={n} className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] leading-snug", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
        {ceo && n.for_role && n.for_role !== "SUPER_ADMIN" && (
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold">
            {n.from_role && <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{ROLE_LABELS[n.from_role] || n.from_role}</span>}
            <span className="text-muted-foreground">→</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{ROLE_LABELS[n.for_role] || n.for_role}</span>
            {n.important && <span className="rounded-full bg-cf-red-soft px-1.5 py-0.5 text-destructive">Important</span>}
            {n.requires_action && !n.done && <span className="text-warning">· task open</span>}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {!ceo && n.requires_action && !n.done && <span className={cn("font-semibold", s.tone)}>{s.label} ·</span>}
          {meta}
        </span>
      </span>
      {!n.read && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}

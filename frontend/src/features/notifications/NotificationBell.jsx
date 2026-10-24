import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Bell, CheckCheck, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { setUnreadCount } from "@/lib/pageTitle"
import { timeAgo } from "@/features/activity/time"
import { severityOf } from "./notificationStyle"
import NotificationIcon from "./NotificationIcon"
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
*/
const EMPTY = { items: [], unread: 0 }
const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
]

export default function NotificationBell() {
  const navigate = useNavigate()
  const { data = EMPTY } = useGetNotificationsQuery()
  const [markRead] = useMarkNotificationReadMutation()
  const [markAllRead] = useMarkAllNotificationsReadMutation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("all")
  const rootRef = useRef(null)

  const { unread } = data
  const visible = useMemo(() => (tab === "unread" ? data.items.filter((n) => !n.read) : data.items), [data.items, tab])
  const tasks = visible.filter((n) => n.requires_action && !n.done)
  const rest = visible.filter((n) => !(n.requires_action && !n.done))

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
              className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white tabular-nums"
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
            className="fixed inset-x-2 top-16 z-50 flex max-h-[calc(100vh-5rem)] origin-top-right flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_20px_48px_-12px_rgba(22,34,30,0.28)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[400px] sm:max-h-[min(560px,calc(100vh-5rem))]"
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
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none transition-colors hover:bg-cf-green-soft focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:text-muted-foreground disabled:opacity-60"
              >
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            </div>

            <div role="tablist" className="flex gap-1 border-b px-3 py-2">
              {TABS.map((t) => (
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
                  {rest.length > 0 && <Section label={tasks.length ? "Earlier" : null} items={rest} onOpen={openItem} />}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Section({ label, items, onOpen }) {
  return (
    <div>
      {label && <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.6px] text-cf-faint">{label}</p>}
      <ul className="py-1">
        {items.map((n) => (
          <li key={n.id}>
            <NotificationRow n={n} onOpen={() => onOpen(n)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function NotificationRow({ n, onOpen }) {
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
        !n.read && "bg-cf-green-soft/40"
      )}
    >
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", n.done ? "bg-muted text-muted-foreground" : `${s.soft} ${s.tone}`)}>
        <NotificationIcon n={n} className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] leading-snug", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">{n.body}</span>}
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {n.requires_action && !n.done && <span className={cn("font-semibold", s.tone)}>{s.label} ·</span>}
          {meta}
        </span>
      </span>
      {!n.read && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, ArrowUpRight, CheckCircle2, X } from "lucide-react"
import { severityOf } from "@/features/notifications/notificationStyle"
import NotificationIcon from "@/features/notifications/NotificationIcon"

/*
  toast.success("Saved") / toast.error("Could not save")       short feedback for the user's own action
  toast.notify({ title, body, severity, type, action })        a notification from someone else (see LiveSync)
      severity  info | success | warning | action   (same look as the header bell)
      action    { label, onClick } -> a button on the toast, e.g. "Open" the order
  A toast stays while the pointer is on it.
*/
const ToastContext = createContext(null)
const NOOP = { success: () => {}, error: () => {}, notify: () => {} }
const DURATION = { success: 3500, error: 6500, notify: 7000 }

export const useToast = () => useContext(ToastContext) ?? NOOP

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const counter = useRef(0)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])
  const startTimer = useCallback((t) => {
    clearTimeout(timers.current.get(t.id))
    timers.current.set(t.id, setTimeout(() => dismiss(t.id), DURATION[t.kind]))
  }, [dismiss])
  const pauseTimer = useCallback((id) => clearTimeout(timers.current.get(id)), [])

  const push = useCallback(
    (toast) => {
      const t = { ...toast, id: ++counter.current }
      setItems((xs) => {
        xs.slice(0, -3).forEach((old) => { clearTimeout(timers.current.get(old.id)); timers.current.delete(old.id) })
        return [...xs.slice(-3), t]
      })
      startTimer(t)
    },
    [startTimer]
  )
  const api = useMemo(
    () => ({
      success: (text) => push({ kind: "success", title: text }),
      error: (text) => push({ kind: "error", title: text }),
      notify: (n) => push({ kind: "notify", ...n }),
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end sm:px-0"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              role={t.kind === "error" ? "alert" : "status"}
              onPointerEnter={() => pauseTimer(t.id)}
              onPointerLeave={() => startTimer(t)}
              className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-3.5 text-[13px] shadow-[0_12px_32px_-8px_rgba(22,34,30,0.22)]"
            >
              <ToastBody t={t} onDismiss={() => dismiss(t.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastBody({ t, onDismiss }) {
  const close = (
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={onDismiss}
      className="-m-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="size-3.5" />
    </button>
  )

  if (t.kind !== "notify") {
    const ok = t.kind === "success"
    const Icon = ok ? CheckCircle2 : AlertCircle
    return (
      <>
        <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-destructive"}`} />
        <p className="flex-1 leading-snug">{t.title}</p>
        {close}
      </>
    )
  }

  const s = severityOf(t)
  return (
    <>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${s.soft} ${s.tone}`}>
        <NotificationIcon n={t} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-bold uppercase tracking-[0.6px] ${s.tone}`}>{s.label}</p>
        <p className="mt-0.5 font-semibold leading-snug text-foreground">{t.title}</p>
        {t.body && <p className="mt-0.5 leading-snug text-muted-foreground">{t.body}</p>}
        {t.action && (
          <button
            type="button"
            onClick={() => { t.action.onClick(); onDismiss() }}
            className="mt-2 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {t.action.label} <ArrowUpRight className="size-3.5" />
          </button>
        )}
      </div>
      {close}
    </>
  )
}

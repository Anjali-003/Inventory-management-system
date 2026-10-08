import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"

const ToastContext = createContext(null)
const NOOP = { success: () => {}, error: () => {} }

export const useToast = () => useContext(ToastContext) ?? NOOP

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (tone, text) => {
      const id = ++counter.current
      setItems((xs) => [...xs.slice(-2), { id, tone, text }])
      setTimeout(() => dismiss(id), tone === "error" ? 6500 : 3500)
    },
    [dismiss]
  )
  const api = useMemo(() => ({ success: (t) => push("success", t), error: (t) => push("error", t) }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end sm:px-0"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const ok = t.tone === "success"
            const Icon = ok ? CheckCircle2 : AlertCircle
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                role={ok ? "status" : "alert"}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-[#dce5e0] bg-card p-3.5 text-[13px] shadow-[0_12px_32px_-8px_rgba(22,34,30,0.22)]"
              >
                <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-destructive"}`} />
                <p className="flex-1 leading-snug">{t.text}</p>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(t.id)}
                  className="-m-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

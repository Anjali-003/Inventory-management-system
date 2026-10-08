import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, Loader2, X } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }

function Panel({ onClose, title, description, size, busy, onSubmit, footer, children, className }) {
  const ref = useRef(null)
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy

  // Focus management, scroll lock, Escape and Tab trapping. Runs once while the dialog is mounted.
  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement
    const body = document.body
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = "hidden"
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    const first = el.querySelector("[data-autofocus]") || el.querySelector("input:not([type=hidden]):not([disabled]), select, textarea")
    ;(first || el).focus()

    const onKey = (e) => {
      if (e.key === "Escape") {
        if (!busyRef.current) closeRef.current()
        return
      }
      if (e.key !== "Tab") return
      const nodes = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (nodes.length === 0) { e.preventDefault(); return }
      const firstNode = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus() }
      else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus() }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      body.style.overflow = before.overflow
      body.style.paddingRight = before.paddingRight
      if (previous && previous.focus) previous.focus()
    }
  }, [])

  const Wrap = onSubmit ? "form" : "div"

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-[#101a17]/45 backdrop-blur-[2px] sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busyRef.current) closeRef.current() }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-[0_24px_64px_-12px_rgba(16,26,23,0.35)] outline-none ring-1 ring-[#dce5e0] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[16px]",
          SIZES[size],
          className
        )}
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-4 border-b bg-gradient-to-r from-slate-50/90 via-white to-white px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-bold leading-snug tracking-[-0.2px]">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
            className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <Wrap {...(onSubmit ? { onSubmit, noValidate: true } : {})} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t bg-cf-head px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end">{footer}</div>}
        </Wrap>
      </motion.div>
    </motion.div>
  )
}

/**
 * Accessible modal dialog. Pass `onSubmit` to wrap the body and footer in a <form>
 * (Enter submits; use type="submit" on the primary footer button).
 */
export function Modal({ open, ...props }) {
  if (typeof document === "undefined") return null
  return createPortal(<AnimatePresence>{open && <Panel key="modal" size="md" {...props} />}</AnimatePresence>, document.body)
}

/** Solid red button for irreversible actions (the shared Button only has a soft red variant). */
export function DangerButton({ busy, children, ...p }) {
  return (
    <button
      type="button"
      {...p}
      disabled={busy || p.disabled}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-destructive px-3.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:pointer-events-none disabled:opacity-50"
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default", busy = false, extra }) {
  const danger = tone === "danger"
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          {extra}
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy} data-autofocus>{cancelLabel}</Button>
          {danger ? (
            <DangerButton onClick={onConfirm} busy={busy}>{confirmLabel}</DangerButton>
          ) : (
            <Button type="button" size="lg" onClick={onConfirm} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          )}
        </>
      }
    >
      <div className="flex gap-3.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", danger ? "bg-cf-red-soft text-destructive" : "bg-cf-green-soft text-primary")}>
          <AlertCircle className="size-[18px]" />
        </span>
        <div className="min-w-0 space-y-2 pt-0.5 text-sm text-muted-foreground">{children}</div>
      </div>
    </Modal>
  )
}

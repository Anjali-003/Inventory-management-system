import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeftRight, BellRing, Check, ChevronRight, Eye, EyeOff, KeyRound, Loader2, LogIn, LogOut, UserRound } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Field } from "@/components/FormField"
import { Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { authService } from "@/features/auth/authService"
import { useChangePasswordMutation } from "@/features/auth/authApi"
import { ROLE_LABELS, setActiveRole } from "@/lib/permissions"
import { disablePush, enablePush, pushState } from "@/lib/push"
import { errorMessage, fmtDateTime } from "@/lib/stock"
import { cn } from "@/lib/utils"

/*
  The avatar in the header and what it opens:
    - who is logged in (name, email, role)
    - My account          details of this login
    - Change password     own password (current one required)
    - Phone & desktop alerts  this role's notifications pop up on this device even when the app is closed (Web Push)
    - Switch workspace    the other roles logged in on this browser, one click each (every role has its own login)
    - Log in to another role  the home page's workflow logins
    - Log out             this role only; the others stay logged in
*/
const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "--"

const ITEM =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent"

export default function ProfileMenu({ user, roleLabel, onLogout }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null) // "account" | "password"
  const [others, setOthers] = useState(null) // other logged-in roles on this browser, loaded when the menu opens
  const [push, setPush] = useState(null) // see lib/push.js pushState(); null = checking
  const [pushBusy, setPushBusy] = useState(false)
  const toast = useToast()
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    authService
      .sessions()
      .then((list) => alive && setOthers(list.filter((s) => s.role !== user?.role)))
      .catch(() => alive && setOthers([]))
    pushState()
      .then((state) => alive && setPush(state))
      .catch(() => alive && setPush("disabled"))
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      alive = false
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, user?.role])

  if (!user) return null
  const initials = initialsOf(user.name)

  const show = (which) => {
    setOpen(false)
    setDialog(which)
  }
  // a full page load: this tab now works as the other role, and nothing cached from this one is shown to it
  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (push === "on") {
        await disablePush()
        setPush("off")
        toast.success("Phone and desktop alerts turned off")
      } else {
        await enablePush()
        setPush("on")
        toast.success("Phone and desktop alerts turned on")
      }
    } catch (err) {
      setPush(typeof Notification !== "undefined" && Notification.permission === "denied" ? "blocked" : push)
      toast.error(err?.message && !err.response ? err.message : errorMessage(err, "Could not change the alerts."))
    } finally {
      setPushBusy(false)
    }
  }
  const switchTo = (role) => {
    setActiveRole(role)
    window.location.assign("/dashboard")
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Account menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "grid size-9 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground ring-1 ring-primary/25 outline-none transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary",
          open && "ring-2 ring-primary/50"
        )}
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-x-2 top-16 z-50 origin-top-right overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-[0_20px_48px_-12px_rgba(23,26,33,0.28)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-80"
          >
            {/* who is logged in */}
            <div className="flex items-center gap-3 border-b px-4 py-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <span className="mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">{roleLabel}</span>
              </div>
            </div>

            <div className="p-1.5">
              <button type="button" role="menuitem" className={ITEM} onClick={() => show("account")}>
                <UserRound className="size-4 text-muted-foreground" /> My account
              </button>
              <button type="button" role="menuitem" className={ITEM} onClick={() => show("password")}>
                <KeyRound className="size-4 text-muted-foreground" /> Change password
              </button>
              {push !== "unsupported" && push !== "disabled" && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={push === "on"}
                  className={cn(ITEM, "disabled:opacity-100")}
                  disabled={push === null || push === "blocked" || pushBusy}
                  onClick={togglePush}
                >
                  <BellRing className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block">Phone &amp; desktop alerts</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {push === "blocked" ? "Blocked. Allow notifications in the browser's site settings." : ""}
                    </span>
                  </span>
                  {pushBusy || push === null ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", push === "on" ? "bg-primary" : "bg-cf-line-strong")}>
                      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", push === "on" ? "left-[18px]" : "left-0.5")} />
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* other roles logged in on this browser */}
            <div className="border-t p-1.5">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-cf-faint">Switch workspace</p>
              {others === null ? (
                <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Checking other logins...</p>
              ) : others.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No other role is logged in on this browser.</p>
              ) : (
                others.map((s) => (
                  <button key={s.role} type="button" role="menuitem" className={ITEM} onClick={() => switchTo(s.role)}>
                    <ArrowLeftRight className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{ROLE_LABELS[s.role] || s.role}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">{s.name}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))
              )}
              <a href="/#login" role="menuitem" className={ITEM}>
                <LogIn className="size-4 text-muted-foreground" /> Log in to another role
              </a>
            </div>

            <div className="border-t p-1.5">
              <button
                type="button"
                role="menuitem"
                className={cn(ITEM, "text-destructive hover:bg-cf-red-soft focus-visible:bg-cf-red-soft")}
                onClick={() => { setOpen(false); onLogout() }}
              >
                <LogOut className="size-4" /> Log out
                <span className="ms-auto text-xs font-normal text-muted-foreground">this role only</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {dialog === "account" && <AccountDialog user={user} roleLabel={roleLabel} onClose={() => setDialog(null)} onChangePassword={() => setDialog("password")} />}
      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

function AccountDialog({ user, roleLabel, onClose, onChangePassword }) {
  const rows = [
    ["Name", user.name],
    ["Email", user.email],
    ["Role", roleLabel],
    ["Account created", user.created_at ? fmtDateTime(user.created_at) : "-"],
  ]
  return (
    <Modal
      open
      onClose={onClose}
      title="My account"
      description="Your name, email and role are set by the system administrator. Ask them if something needs to change."
      footer={
        <>
          <MktBtn onClick={onClose} className="sm:me-auto" data-autofocus>Close</MktBtn>
          <MktBtn variant="primary" onClick={onChangePassword}><KeyRound /> Change password</MktBtn>
        </>
      }
    >
      <dl className="divide-y overflow-hidden rounded-xl border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}

const INPUT =
  "h-10 w-full rounded-[10px] border border-cf-line-strong bg-card px-3 pe-10 text-base outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive sm:text-sm"

function PasswordInput({ id, value, onChange, error, autoComplete }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:text-primary"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function PasswordDialog({ onClose }) {
  const toast = useToast()
  const [changePassword, { isLoading: busy }] = useChangePasswordMutation()
  const [form, setForm] = useState({ current: "", next: "", confirm: "" })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState("")
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const rules = [
    { ok: form.next.length >= 8, text: "At least 8 characters" },
    { ok: form.next.length > 0 && form.next !== form.current, text: "Different from the current password" },
    { ok: form.confirm.length > 0 && form.next === form.confirm, text: "Both new passwords match" },
  ]

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    const found = {}
    if (!form.current) found.current = "Enter your current password."
    if (form.next.length < 8) found.next = "The new password must be at least 8 characters."
    else if (form.next === form.current) found.next = "The new password must be different from the current one."
    if (form.confirm !== form.next) found.confirm = "The two new passwords do not match."
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      await changePassword({ current_password: form.current, new_password: form.next }).unwrap()
      toast.success("Password changed. Use the new one the next time you log in.")
      onClose()
    } catch (err) {
      const data = err?.response?.data || err?.data || {}
      const field = data.extra?.field || data.field
      const message = data.message || errorMessage(err, "Could not change the password.")
      if (field === "current_password") setErrors({ current: message })
      else if (field === "new_password") setErrors({ next: message })
      else setServerError(message)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      title="Change password"
      description="For your own login only. Other people's passwords are reset by the system administrator."
      footer={
        <>
          <MktBtn onClick={onClose} disabled={busy} className="sm:me-auto">Cancel</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password
          </MktBtn>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not change the password">{serverError}</Notice>}
        <Field label="Current password" htmlFor="pw-current" required error={errors.current}>
          <PasswordInput id="pw-current" value={form.current} onChange={set("current")} error={errors.current} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="pw-next" required error={errors.next}>
          <PasswordInput id="pw-next" value={form.next} onChange={set("next")} error={errors.next} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" required error={errors.confirm}>
          <PasswordInput id="pw-confirm" value={form.confirm} onChange={set("confirm")} error={errors.confirm} autoComplete="new-password" />
        </Field>
        <ul className="space-y-1 rounded-xl bg-muted px-4 py-3 text-xs">
          {rules.map((r) => (
            <li key={r.text} className={cn("flex items-center gap-2", r.ok ? "text-success" : "text-muted-foreground")}>
              <Check className={cn("size-3.5", !r.ok && "opacity-30")} aria-hidden /> {r.text}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

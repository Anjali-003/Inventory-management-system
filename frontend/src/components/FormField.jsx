import { cn } from "../lib/utils"

const base =
  "h-9 rounded-[8px] border bg-card px-3 text-[13px] outline-none transition-shadow placeholder:text-cf-faint focus-visible:ring-3 disabled:opacity-50"
const ok = "border-cf-line-strong focus-visible:border-primary focus-visible:ring-primary/15"
const bad = "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25"

// Full width unless the caller passes its own width class (avoids two conflicting w-* classes).
export const TextInput = ({ error, className, ...p }) => (
  <input className={cn(base, error ? bad : ok, /(^|\s)w-/.test(className || "") ? "" : "w-full", className)} aria-invalid={error ? true : undefined} {...p} />
)

/** Class string for a native <select> used as a toolbar filter (chevron comes from index.css). */
export const selectClass =
  "h-9 rounded-[8px] border border-cf-line-strong bg-card pl-3 pr-8 text-[13px] outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"

export function Field({ label, htmlFor, required, error, hint, className, children }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

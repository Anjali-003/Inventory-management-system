import { AlertCircle, RotateCw } from "lucide-react"

export default function ErrorBanner({ title = "Something went wrong", children, onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-cf-red-soft px-4 py-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <p className="mt-0.5 opacity-90">{children}</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-destructive/30 bg-card px-2.5 text-xs font-semibold text-destructive outline-none transition-colors hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-destructive/30">
          <RotateCw className="size-3.5" /> Try again
        </button>
      )}
    </div>
  )
}

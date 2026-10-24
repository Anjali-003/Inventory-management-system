import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Accessible, bounded whole-unit selector shared by Production and Store workflows. */
export default function QuantityStepper({
  id,
  label,
  description,
  value,
  min = 1,
  max,
  unitLabel = "units",
  onChange,
  disabled = false,
}) {
  const parsed = Number(value)
  const hasValue = String(value ?? "").trim() !== "" && Number.isFinite(parsed)
  const current = hasValue ? parsed : min
  const validBounds = Number.isFinite(Number(max)) && Number(max) >= min
  const maximum = validBounds ? Number(max) : min
  const canDecrease = !disabled && validBounds && hasValue && current > min
  const canIncrease = !disabled && validBounds && current < maximum

  const step = (delta) => {
    if (disabled || !validBounds) return
    const next = Math.min(maximum, Math.max(min, (hasValue ? current : min) + delta))
    onChange?.(String(next))
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-violet-50/80 p-3 sm:p-4">
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm font-bold leading-snug text-slate-950 sm:text-base">
          {label}
        </label>
        {description && <p className="text-xs leading-relaxed text-slate-600">{description}</p>}
      </div>

      <div className="mt-3 grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2 sm:grid-cols-[44px_minmax(0,1fr)_44px]">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-lg border-violet-200 bg-white text-violet-800 hover:bg-violet-50 sm:size-11"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={!canDecrease}
          onClick={() => step(-1)}
        >
          <Minus className="size-4" aria-hidden />
        </Button>

        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={validBounds ? maximum : undefined}
          step="1"
          value={value}
          disabled={disabled || !validBounds}
          onChange={(event) => onChange?.(event.target.value)}
          className="h-11 w-full min-w-0 rounded-lg border border-violet-200 bg-white px-2 text-center text-2xl font-bold tabular-nums text-slate-950 outline-none transition focus:border-violet-600 focus:ring-4 focus:ring-violet-600/15 disabled:bg-slate-100 disabled:text-slate-400 sm:h-12 sm:text-3xl"
          aria-describedby={`${id}-limit`}
        />

        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-lg border-violet-200 bg-white text-violet-800 hover:bg-violet-50 sm:size-11"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={!canIncrease}
          onClick={() => step(1)}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>

      <p id={`${id}-limit`} className="mt-2 text-[11px] text-slate-600" aria-live="polite">
        <span className="font-bold text-violet-800">{hasValue && Number.isInteger(parsed) ? parsed : 0} {unitLabel}</span>
        {validBounds ? ` selected · maximum ${maximum}` : " · no quantity currently available"}
      </p>
    </section>
  )
}

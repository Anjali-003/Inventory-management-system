import { cn } from "../lib/utils"
import { initials } from "../lib/format"

const TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
]

const SIZES = { sm: "size-8 text-xs", md: "size-9 text-xs", lg: "size-11 text-sm" }

const toneFor = (name = "") => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export default function Avatar({ name, size = "md", muted = false, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-full font-semibold",
        SIZES[size],
        muted ? "bg-muted text-muted-foreground" : toneFor(name),
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

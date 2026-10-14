import { useEffect, useState } from "react"
import { initials } from "@/lib/format"
import { timeAgo } from "./time"

/* One row per action: avatar, "Name · what they did", and how long ago. */
export default function ActivityFeed({ items, meId }) {
  const [, tick] = useState(0)

  // keep "5 min ago" fresh without refetching
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
  }

  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-5 py-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(a.user_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug">
              <span className="font-medium">{a.user_id === meId ? "You" : a.user_name}</span>
              <span className="text-muted-foreground"> · </span>
              {a.summary}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground" title={new Date(a.created_at).toLocaleString()}>
              {timeAgo(a.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

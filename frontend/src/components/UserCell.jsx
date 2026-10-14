import Avatar from "./Avatar"
import { cn } from "../lib/utils"

/*
  "Who did this" cell: small avatar + name, optional muted second line.
  No name (old rows, or nothing recorded yet) shows a dash.
*/
export default function UserCell({ name, sub, className }) {
  if (!name) return <span className="text-muted-foreground">-</span>

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar name={name} size="xs" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  )
}

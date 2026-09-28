import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
        warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/25",
        danger: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
        info: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

export function Badge({ className, variant, children, ...p }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...p}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

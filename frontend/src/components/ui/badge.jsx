import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-destructive/10 text-destructive",
        info: "bg-primary/10 text-primary",
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

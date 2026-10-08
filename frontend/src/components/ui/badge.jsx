import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-[11px] font-semibold",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        success: "bg-cf-green-soft text-primary",
        warning: "bg-cf-amber-soft text-warning",
        danger: "bg-cf-red-soft text-destructive",
        info: "bg-cf-blue-soft text-cf-blue",
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

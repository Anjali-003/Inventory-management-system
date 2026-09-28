import { cn } from "../../lib/utils"

export const Table = ({ className, ...p }) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
  </div>
)
export const TableHeader = (p) => <thead className="bg-muted border-b" {...p} />
export const TableBody = (p) => <tbody {...p} />
export const TableRow = ({ className, ...p }) => (
  <tr className={cn("animate-in fade-in duration-300 border-t transition-colors first:border-t-0 hover:bg-muted/40 data-[active=true]:bg-accent", className)} {...p} />
)
export const TableHead = ({ className, ...p }) => (
  <th className={cn("h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...p} />
)
export const TableCell = ({ className, ...p }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 align-middle", className)} {...p} />
)

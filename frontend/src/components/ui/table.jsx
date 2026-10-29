import { cn } from "../../lib/utils"

export const Table = ({ className, ...p }) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn("w-full caption-bottom text-[13px]", className)} {...p} />
  </div>
)
export const TableHeader = (p) => <thead className="border-b bg-cf-head" {...p} />
export const TableBody = (p) => <tbody {...p} />
export const TableRow = ({ className, ...p }) => (
  <tr className={cn("border-t transition-colors first:border-t-0 hover:bg-accent/60 data-[active=true]:bg-accent", className)} {...p} />
)
export const TableHead = ({ className, ...p }) => (
  <th scope="col" className={cn("h-10 whitespace-nowrap px-[18px] text-left align-middle text-[11px] font-semibold uppercase tracking-[0.4px] text-cf-faint", className)} {...p} />
)
export const TableCell = ({ className, ...p }) => (
  <td className={cn("whitespace-nowrap px-[18px] py-3 align-middle", className)} {...p} />
)

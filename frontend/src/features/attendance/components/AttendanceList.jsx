import { EmptyState } from "@/components/feedback"
import { pageButtonClass } from "@/components/PageKit"
import { Users, SearchX } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { EmployeeRow } from "./EmployeeRow"

export default function AttendanceList({
  busy,
  clearFilters,
  isToday,
  loading,
  now,
  onCheck,
  rows,
  setConfirm,
  visible,
}) {
  return (
    loading ? (
      <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading attendance">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2"><div className="h-3.5 w-40 animate-pulse rounded bg-muted" /><div className="h-3 w-28 animate-pulse rounded bg-muted" /></div>
            <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    ) : rows.length === 0 ? (
      <div>
        <EmptyState icon={Users} title="No active employees">Add employees first, then come back to mark attendance.</EmptyState>
        <div className="-mt-6 flex justify-center pb-10">
          <Link to="/employees" className={pageButtonClass("primary")}>Go to employees</Link>
        </div>
      </div>
    ) : visible.length === 0 ? (
      <div>
        <EmptyState icon={SearchX} title="No matching employees">Try a different name, department or status.</EmptyState>
        <div className="-mt-6 flex justify-center pb-10"><Button variant="outline" size="lg" onClick={clearFilters}>Clear filters</Button></div>
      </div>
    ) : (
      <>
        <div className="hidden gap-x-4 border-b bg-muted/60 px-5 py-2.5 text-xs font-medium text-muted-foreground xl:flex">
          <span className="min-w-[14rem] flex-1">Employee</span>
          <span className="w-28 shrink-0">Status</span>
          <span className="w-40 shrink-0">Time</span>
          <span className="w-[19.5rem] shrink-0 text-right">Actions</span>
        </div>
        <ul className="divide-y">
          {visible.map((e) => (
            <EmployeeRow
              key={e.employee_id}
              e={e}
              isToday={isToday}
              now={now}
              busyKey={busy[e.employee_id]}
              onCheck={() => onCheck(e)}
              onHalf={() => setConfirm({ employee: e, key: "half-day" })}
              onAbsent={() => setConfirm({ employee: e, key: "ABSENT" })}
              onLeave={() => setConfirm({ employee: e, key: "LEAVE" })}
            />
          ))}
        </ul>
      </>
    )
  )
}

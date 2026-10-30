import { formatDuration, toMinutes } from "@/lib/format"
import { stageOf } from "../attendanceFlow"
import { LogOut, LogIn, Loader2 } from "lucide-react"
import Avatar from "@/components/Avatar"
import { Badge } from "@/components/ui/badge"
import { AttendanceStatus } from "@/components/feedback"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SegButton } from "./SegButton"

function timeCell(e, stage, isToday, now) {
  if (stage === "checkedIn") {
    const worked = isToday ? formatDuration(now - toMinutes(e.check_in)) : null
    return { main: `In ${e.check_in}`, sub: isToday ? `Working ${worked}` : "No check-out recorded" }
  }
  if (stage === "checkedOut" || stage === "halfDay") {
    return { main: `${e.check_in} - ${e.check_out}`, sub: formatDuration(toMinutes(e.check_out) - toMinutes(e.check_in)) }
  }
  return { main: "-", sub: null }
}

export function EmployeeRow({ e, isToday, now, busyKey, onCheck, onHalf, onAbsent, onLeave }) {
  const stage = stageOf(e)
  const busy = !!busyKey
  const checking = stage === "checkedIn"
  const t = timeCell(e, stage, isToday, now)
  const checkDisabled = busy || (stage !== "initial" && stage !== "checkedIn")
  const CheckIcon = checking ? LogOut : LogIn

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3 transition-colors hover:bg-muted/30">
      <div className="flex min-w-[14rem] flex-1 items-center gap-3">
        <Avatar name={e.name} />
        <div className="min-w-0">
          <p className="truncate font-medium">{e.name}</p>
          <p className="truncate text-xs text-muted-foreground">{e.employee_code} · {e.department || "No department"}</p>
        </div>
      </div>

      <div className="w-28 shrink-0">
        {stage === "initial" ? <Badge variant="neutral">Not marked</Badge> : stage === "checkedIn" ? <Badge variant="info">Checked in</Badge> : <AttendanceStatus status={e.status} />}
      </div>

      <div className="w-40 shrink-0">
        <p className="text-sm tabular-nums">{t.main}</p>
        {t.sub && <p className={cn("text-xs tabular-nums", stage === "checkedIn" && !isToday ? "text-warning" : "text-muted-foreground")}>{t.sub}</p>}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 xl:w-[19.5rem] xl:justify-end">
        <span title={checkDisabled && !busy ? "Attendance is already recorded" : undefined}>
          <Button size="sm" className="min-w-[6.5rem]" disabled={checkDisabled} onClick={onCheck}>
            {busyKey === "check-in" || busyKey === "check-out" ? <Loader2 className="animate-spin" /> : <CheckIcon />}
            {checking ? "Check Out" : "Check In"}
          </Button>
        </span>
        <div role="group" aria-label={`More actions for ${e.name}`} className="inline-flex overflow-hidden rounded-md border">
          <SegButton label="Half day" reason="Available after check out" disabled={busy || stage !== "checkedOut"} spinning={busyKey === "half-day"} onClick={onHalf} />
          <SegButton label="Absent" reason="Only available before check in" disabled={busy || stage !== "initial"} spinning={busyKey === "ABSENT"} onClick={onAbsent} />
          <SegButton label="Leave" reason="Only available before check in" disabled={busy || stage !== "initial"} spinning={busyKey === "LEAVE"} onClick={onLeave} />
        </div>
      </div>
    </li>
  )
}

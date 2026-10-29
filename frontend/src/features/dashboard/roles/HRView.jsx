import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CalendarCheck, CheckCircle2, Clock3, TrendingDown, UserX, Users } from "lucide-react"
import { pageButtonClass } from "@/components/PageKit"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetEmployeesQuery } from "@/features/employees/employeesApi"
import { useGetAttendanceQuery } from "@/features/attendance/attendanceApi"
import { attendanceService } from "@/features/attendance/attendanceService"
import { Greeting, Line, ListPanel, Panel, StatRow, useDrill } from "../DashboardKit"

const EMPTY = []
const SHORT_ATTENDANCE_THRESHOLD = 75
const isPresent = (row) => ["PRESENT", "CHECKED_IN", "HALF_DAY"].includes(String(row.status || "").toUpperCase()) || (!row.status && row.check_in)
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
function shiftDate(date, offset) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const personRow = (e, extra) => ({ id: `e${e.employee_id ?? e.id ?? e.employee_code ?? e.name}`, title: e.name || "Unnamed employee", sub: e.department || e.employee_code || "Employee", to: "/attendance", ...extra })

/*
  HR dashboard, in the one dashboard look (the Super Admin's): "Hello" and the next thing to do (mark today's
  attendance), the figures for today and the month, then who is absent, who is short on attendance, and the week.
*/
export default function HRView() {
  const drill = useDrill()
  const date = useMemo(() => localDate(), [])
  const employeesQuery = useGetEmployeesQuery()
  const attendanceQuery = useGetAttendanceQuery(date)
  const employees = Array.isArray(employeesQuery.data) ? employeesQuery.data : EMPTY
  const attendance = Array.isArray(attendanceQuery.data) ? attendanceQuery.data : EMPTY
  const [weekly, setWeekly] = useState([])
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [monthly, setMonthly] = useState([])
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [reportError, setReportError] = useState(false)
  const activeEmployees = employees.filter((employee) => employee.is_active !== false && employee.is_active !== 0).length
  const present = attendance.filter(isPresent).length
  const notMarked = attendance.filter((row) => !row.status && !row.check_in).length
  // Only explicitly marked ABSENT records are shown as absentees; unmarked employees remain separate.
  const absentees = useMemo(() => attendance.filter((row) => String(row.status || "").toUpperCase() === "ABSENT"), [attendance])
  const shortAttendance = useMemo(() => monthly
    .filter((employee) => employee.pct !== null && employee.pct < SHORT_ATTENDANCE_THRESHOLD)
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)), [monthly])

  useEffect(() => {
    let alive = true
    const dates = Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6))
    Promise.all(dates.map(async (day) => {
      try { const response = await attendanceService.daily(day); const rows = Array.isArray(response.data) ? response.data : []; return { date: day, count: rows.filter(isPresent).length } }
      catch { return { date: day, count: 0 } }
    })).then((rows) => { if (alive) setWeekly(rows.map((row) => ({ ...row, label: new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" }) }))) }).finally(() => { if (alive) setWeeklyLoading(false) })
    return () => { alive = false }
  }, [date])
  useEffect(() => {
    let alive = true
    attendanceService.monthlySummary(date.slice(0, 7)).then(({ data }) => {
      if (!alive) return
      const rows = Array.isArray(data) ? data : []
      setMonthly(rows.map((r) => { const p = Number(r.present || 0), h = Number(r.half_day || 0), a = Number(r.absent || 0); const total = p + h + a; return { ...r, pct: total ? Math.round(((p + h * 0.5) / total) * 100) : null } }))
      setReportError(false)
    }).catch(() => { if (alive) setReportError(true) }).finally(() => { if (alive) setMonthlyLoading(false) })
    return () => { alive = false }
  }, [date])

  const nudge = attendanceQuery.isLoading ? "Loading today's attendance…"
    : notMarked ? `${plural(notMarked, "employee")} not marked yet today. Take attendance.`
    : absentees.length ? `Everyone is marked. ${plural(absentees.length, "employee")} absent today.`
    : "Everyone is marked for today."

  return (
    <>
      <Greeting description={nudge}>
        <Link to="/attendance" className={pageButtonClass("primary")}><CalendarCheck /> Take attendance</Link>
      </Greeting>

      <StatRow drill={drill} stats={[
        { label: "Not marked today", value: notMarked, icon: Clock3, tone: notMarked ? "amber" : "green", loading: attendanceQuery.isLoading,
          detail: notMarked ? "Attendance still to record" : "Everyone is marked", to: "/attendance" },
        { label: "Present today", value: present, icon: CheckCircle2, tone: "green", loading: attendanceQuery.isLoading,
          detail: `of ${plural(activeEmployees, "active employee")}`, to: "/attendance" },
        { label: "Absent today", value: absentees.length, icon: UserX, tone: absentees.length ? "red" : "green", loading: attendanceQuery.isLoading,
          detail: absentees.length ? "Marked absent" : "Nobody absent", to: "/attendance" },
        { label: `Below ${SHORT_ATTENDANCE_THRESHOLD}% this month`, value: shortAttendance.length, icon: TrendingDown, tone: shortAttendance.length ? "amber" : "green", loading: monthlyLoading,
          detail: shortAttendance.length ? "Short on attendance" : "Everyone is on track", to: "/attendance" },
        { label: "Employees", value: employees.length, icon: Users, tone: "blue", loading: employeesQuery.isLoading, detail: `${activeEmployees} active`, to: "/employees" },
      ]} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ListPanel drill={drill} loading={attendanceQuery.isLoading} title="Absent today" description="Marked absent today." to="/attendance" toLabel="Attendance"
          rows={absentees.map((e) => personRow(e, { badge: { variant: "danger", label: "Absent" } }))} empty="Nobody is absent today." />
        <ListPanel drill={drill} loading={monthlyLoading} title="Short on attendance" description={`Below ${SHORT_ATTENDANCE_THRESHOLD}% this month, lowest first.`} to="/attendance" toLabel="Attendance"
          rows={shortAttendance.map((e) => personRow(e, { right: e.pct === null ? "—" : `${e.pct}%`, badge: e.pct < 60 ? { variant: "danger", label: "Low" } : undefined }))}
          empty={reportError ? "Monthly attendance could not be loaded. Open Attendance to retry." : `Everyone is at ${SHORT_ATTENDANCE_THRESHOLD}% or more this month.`} />
        <Panel title="This week" description="Employees present each day." to="/attendance" toLabel="Attendance">
          {weeklyLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div> : (
            [...weekly].reverse().map((day) => <Line key={day.date} label={day.date === date ? `${day.label} (today)` : day.label} value={day.count} />)
          )}
        </Panel>
      </div>
      {drill.host}
    </>
  )
}

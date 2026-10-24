import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, CalendarCheck, CheckCircle2, Clock3, Users, UserRoundCheck, TrendingUp, UserX, TrendingDown, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useGetEmployeesQuery } from "@/features/employees/employeesApi"
import { useGetAttendanceQuery } from "@/features/attendance/attendanceApi"
import { attendanceService } from "@/features/attendance/attendanceService"
import { MktHero, HeroLink } from "@/features/marketing-orders/mktKit"

const EMPTY = []
const isPresent = (row) => ["PRESENT", "CHECKED_IN", "HALF_DAY"].includes(String(row.status || "").toUpperCase()) || (!row.status && row.check_in)
function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
function shiftDate(date, offset) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function Metric({ icon: Icon, label, value, note, loading, tone = "green", to }) {
  const tones = { green: "bg-gradient-to-br from-emerald-700 to-teal-800 text-white shadow-sm shadow-emerald-700/20", blue: "bg-gradient-to-br from-sky-700 to-blue-800 text-white shadow-sm shadow-blue-700/20", amber: "bg-gradient-to-br from-amber-700 to-orange-800 text-white shadow-sm shadow-orange-700/20", violet: "bg-gradient-to-br from-violet-600 to-indigo-800 text-white shadow-sm shadow-violet-700/20" }
  const content = <Card className="h-full border-[#E3E6EB] bg-gradient-to-br from-white to-emerald-50/40 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><CardHeader className="gap-3 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="size-[18px]" aria-hidden="true" /></span></div>{loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>}<p className="text-xs text-muted-foreground">{note}</p></CardHeader></Card>
  return to ? <Link to={to} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link> : content
}
function PanelHeading({ title, subtitle, to, linkLabel }) {
  return <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-base font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>{to && <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{linkLabel}<ArrowRight className="size-4" /></Link>}</div>
}
function AttendanceBarChart({ data, loading }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return <Card className="border-[#E3E6EB] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]"><div className="border-b px-5 py-4"><PanelHeading title="Daily attendance" subtitle="Employees marked present over the last 7 days" to="/attendance" linkLabel="View attendance" /></div>{loading ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((n) => <Skeleton key={n} className="h-6 w-full" />)}</div> : data.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Attendance data is not available yet.</p> : <div className="p-4 sm:p-5"><div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label="Bar chart of employees present for each of the last seven days">{data.map((day) => <Link key={day.date} to="/attendance" title={`${day.label}: ${day.count} present`} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="text-xs font-medium tabular-nums text-muted-foreground">{day.count}</span><div className="flex h-32 w-full items-end rounded-t-md bg-muted/50"><div className={`w-full rounded-t-md transition-all group-hover:opacity-80 ${day.date === localDate() ? "bg-gradient-to-t from-emerald-700 to-teal-500 shadow-[0_4px_12px_rgba(122,53,255,0.25)]" : "bg-gradient-to-t from-emerald-500/55 to-teal-400/45 group-hover:from-emerald-500 group-hover:to-teal-400"}`} style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / max) * 100)}%` }} /></div><span className="text-[11px] text-muted-foreground">{day.label}</span></Link>)}</div><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-sm bg-emerald-700" />Today <span className="ml-3 size-2 rounded-sm bg-emerald-600/35" />Previous days</div></div>}</Card>
}
const SHORT_ATTENDANCE_THRESHOLD = 75
const DASHBOARD_LIST_LIMIT = 4

function EmployeeStatusList({ title, subtitle, data, loading, emptyMessage, icon: Icon, kind }) {
  const [expanded, setExpanded] = useState(false)
  const visibleEmployees = expanded ? data : data.slice(0, DASHBOARD_LIST_LIMIT)
  const isShortAttendance = kind === "short-attendance"

  return <Card className="border-[#E3E6EB] bg-white shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)]">
    <div className="border-b px-5 py-4">
      <PanelHeading title={title} subtitle={subtitle} to="/attendance" linkLabel="Open attendance" />
      {!loading && <p className="mt-2 text-xs text-muted-foreground">{data.length} {data.length === 1 ? "employee" : "employees"}</p>}
    </div>
    {loading ? <div className="space-y-4 p-5">{[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-12 w-full" />)}</div> : data.length === 0 ? <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-5 py-8 text-center"><span className={`flex size-10 items-center justify-center rounded-xl ${isShortAttendance ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-700"}`}><Icon className="size-5" aria-hidden="true" /></span><p className="text-sm text-muted-foreground">{emptyMessage}</p></div> : <>
      <div className="divide-y">
        {visibleEmployees.map((employee) => {
          const initials = String(employee.name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
          const pct = employee.pct == null ? null : Math.max(0, Math.min(100, Number(employee.pct)))
          const attendanceTone = pct !== null && pct < 60 ? "rose" : "amber"
          return <Link key={employee.employee_id || employee.employee_code || employee.name} to="/attendance" className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ${isShortAttendance ? (attendanceTone === "rose" ? "bg-gradient-to-br from-rose-600 to-pink-800" : "bg-gradient-to-br from-amber-700 to-orange-800") : "bg-gradient-to-br from-rose-600 to-red-800"}`}>{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{employee.name || "Unnamed employee"}</span>
              <span className="block truncate text-xs text-muted-foreground">{employee.department || employee.employee_code || "Employee"}</span>
              {isShortAttendance && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${attendanceTone === "rose" ? "bg-rose-500" : "bg-amber-500"}`} style={{ width: `${pct ?? 0}%` }} /></span>}
            </span>
            {isShortAttendance ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${attendanceTone === "rose" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{pct === null ? "—" : `${pct}%`}</span> : <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Absent</span>}
          </Link>
        })}
      </div>
      {data.length > DASHBOARD_LIST_LIMIT && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center justify-center gap-2 border-t px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {expanded ? <>Show less <ChevronUp className="size-4" /></> : <>View more ({data.length - DASHBOARD_LIST_LIMIT}) <ChevronDown className="size-4" /></>}
      </button>}
    </>}
  </Card>
}
export default function HRView() {
  const date = useMemo(localDate, [])
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
    setWeeklyLoading(true)
    Promise.all(dates.map(async (day) => {
      try { const response = await attendanceService.daily(day); const rows = Array.isArray(response.data) ? response.data : []; return { date: day, count: rows.filter(isPresent).length } }
      catch { return { date: day, count: 0 } }
    })).then((rows) => { if (alive) setWeekly(rows.map((row) => ({ ...row, label: new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }) }))) }).finally(() => { if (alive) setWeeklyLoading(false) })
    return () => { alive = false }
  }, [date])
  useEffect(() => {
    let alive = true
    setMonthlyLoading(true)
    attendanceService.monthlySummary(date.slice(0, 7)).then(({ data }) => {
      if (!alive) return
      const rows = Array.isArray(data) ? data : []
      setMonthly(rows.map((r) => { const p = Number(r.present || 0), h = Number(r.half_day || 0), a = Number(r.absent || 0); const total = p + h + a; return { ...r, pct: total ? Math.round(((p + h * 0.5) / total) * 100) : null } }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)))
      setReportError(false)
    }).catch(() => { if (alive) setReportError(true) }).finally(() => { if (alive) setMonthlyLoading(false) })
    return () => { alive = false }
  }, [date])
  return <div className="space-y-5">
    <MktHero eyebrow="HR dashboard" title="Your people, at a glance" description="A simple view of today's attendance and your team's monthly attendance trends."><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to="/employees"><Users /> Employee records</HeroLink><HeroLink wrap="flex w-full sm:inline-flex sm:w-auto" className="h-11 w-full sm:h-10 sm:w-auto" to="/attendance"><CalendarCheck /> Take attendance</HeroLink></div></MktHero>
    <section aria-label="HR overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Users} label="Total employees" value={employees.length} note="Open employee records" loading={employeesQuery.isLoading} tone="blue" to="/employees" /><Metric icon={UserRoundCheck} label="Active employees" value={activeEmployees} note="Currently active" loading={employeesQuery.isLoading} tone="green" to="/employees" /><Metric icon={CheckCircle2} label="Present today" value={present} note="Present or checked in" loading={attendanceQuery.isLoading} tone="green" to="/attendance" /><Metric icon={Clock3} label="Not marked" value={notMarked} note="Attendance still to record" loading={attendanceQuery.isLoading} tone="amber" to="/attendance" /></section>
    <section className="grid items-start gap-4 xl:grid-cols-2" aria-label="Attendance overview and exceptions">
      <AttendanceBarChart data={weekly} loading={weeklyLoading} />
      <div className="grid content-start gap-4">
        <EmployeeStatusList title="Short attendance" subtitle={`Employees below ${SHORT_ATTENDANCE_THRESHOLD}% attendance this month`} data={shortAttendance} loading={monthlyLoading} emptyMessage={`No employees are below ${SHORT_ATTENDANCE_THRESHOLD}% attendance this month.`} icon={TrendingDown} kind="short-attendance" />
        <EmployeeStatusList title="Today's absentees" subtitle="Employees explicitly marked absent today" data={absentees} loading={attendanceQuery.isLoading} emptyMessage="No employees have been marked absent today." icon={UserX} kind="absent" />
      </div>
    </section>
    {reportError && <p className="text-xs text-muted-foreground">Monthly attendance percentages could not be loaded. Open the attendance report to retry.</p>}
    <section className="space-y-3"><PanelHeading title="Quick actions" subtitle="Jump straight to common HR tasks." /><div className="grid gap-4 sm:grid-cols-2"><Link to="/employees" className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="h-full border-[#E3E6EB] bg-gradient-to-br from-white to-emerald-50/60 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-all group-hover:-translate-y-0.5 group-hover:border-emerald-300 group-hover:shadow-md"><CardHeader className="gap-3 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white shadow-sm shadow-emerald-700/20"><Users className="size-5" /></span><CardTitle className="text-base">Employee records</CardTitle><CardDescription>Add employees, update details, and review departments or employment status.</CardDescription><span className="inline-flex items-center gap-2 pt-1 text-sm font-semibold text-primary">Manage employees <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span></CardHeader></Card></Link><Link to="/attendance" className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="h-full border-[#E3E6EB] bg-gradient-to-br from-white to-sky-50/70 shadow-[0_1px_2px_rgba(22,34,30,0.04),0_8px_22px_rgba(22,34,30,0.05)] transition-all group-hover:-translate-y-0.5 group-hover:border-sky-300 group-hover:shadow-md"><CardHeader className="gap-3 p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-700 to-blue-800 text-white shadow-sm shadow-blue-700/20"><TrendingUp className="size-5" /></span><CardTitle className="text-base">Attendance reports</CardTitle><CardDescription>Review daily attendance, monthly percentages, absences, and leave.</CardDescription><span className="inline-flex items-center gap-2 pt-1 text-sm font-semibold text-primary">View reports <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span></CardHeader></Card></Link></div></section>
  </div>
}

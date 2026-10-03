import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Loader2, LogIn, LogOut, SearchX, Users } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import SearchBar from "../components/SearchBar"
import Avatar from "../components/Avatar"
import ErrorBanner from "../components/ErrorBanner"
import Pagination from "../components/Pagination"
import SortHeader from "../components/SortHeader"
import StatStrip from "../components/StatStrip"
import { ConfirmDialog, Modal } from "../components/Modal"
import { Field, TextInput, selectClass } from "../components/FormField"
import { useToast } from "../components/toast"
import { AttendanceStatus, EmptyState } from "../components/feedback"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { downloadCsv } from "../lib/csv"
import { firstName, formatDuration, fromMinutes, localDate, longDate, monthLabel, nowMinutes, shiftDate, shiftMonth, toMinutes } from "../lib/format"
import { cn } from "../lib/utils"

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/*   initial -> checkedIn -> checkedOut (PRESENT) -> halfDay           */
/*   initial -> closed (ABSENT / LEAVE)                                */
/* ------------------------------------------------------------------ */
const stageOf = (e) => {
  if (e.status === "ABSENT" || e.status === "LEAVE") return "closed"
  if (e.status === "HALF_DAY") return "halfDay"
  if (e.check_out) return "checkedOut"
  if (e.check_in) return "checkedIn"
  return "initial"
}

// Which summary bucket an employee falls into for the day
const bucketOf = (e) => e.status || (e.check_in ? "CHECKED_IN" : "NONE")

const DONE = {
  "check-in": (n) => `${n} checked in`,
  "check-out": (n) => `${n} checked out`,
  "half-day": (n) => `${n} marked as half day`,
  ABSENT: (n) => `${n} marked absent`,
  LEAVE: (n) => `${n} marked on leave`,
}

const CONFIRMS = {
  "half-day": {
    title: "Mark as half day?",
    label: "Mark half day",
    tone: "default",
    body: (n, d) => `${n} is marked present for ${d}. Changing it to half day is final and can't be undone.`,
  },
  ABSENT: {
    title: "Mark as absent?",
    label: "Mark absent",
    tone: "danger",
    body: (n, d) => `${n} will be recorded as absent for ${d}. Attendance can't be changed once it's saved.`,
  },
  LEAVE: {
    title: "Mark as on leave?",
    label: "Mark leave",
    tone: "default",
    body: (n, d) => `${n} will be recorded as on leave for ${d}. Attendance can't be changed once it's saved.`,
  },
}

const CELLS = [
  { key: "PRESENT", label: "Present", tone: "success" },
  { key: "HALF_DAY", label: "Half day", tone: "warning" },
  { key: "ABSENT", label: "Absent", tone: "danger" },
  { key: "LEAVE", label: "On leave", tone: "info" },
  { key: "CHECKED_IN", label: "Checked in", tone: "info" },
  { key: "NONE", label: "Not marked", tone: "neutral" },
]

/* ------------------------------------------------------------------ */
/* Daily sheet                                                         */
/* ------------------------------------------------------------------ */
function SegButton({ label, reason, disabled, spinning, onClick }) {
  return (
    <span title={disabled && reason ? reason : undefined} className="flex border-r last:border-r-0">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex h-7 items-center gap-1 bg-background px-2.5 text-xs font-medium text-foreground/85 outline-none transition-colors hover:bg-muted focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:bg-muted/40 disabled:text-muted-foreground/60"
      >
        {spinning && <Loader2 className="size-3 animate-spin" />}
        {label}
      </button>
    </span>
  )
}

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

function EmployeeRow({ e, isToday, now, busyKey, onCheck, onHalf, onAbsent, onLeave }) {
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

function DailySheet() {
  const toast = useToast()
  const today = localDate()
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState({})
  const [query, setQuery] = useState("")
  const [dept, setDept] = useState("")
  const [filter, setFilter] = useState(null)
  const [confirm, setConfirm] = useState(null) // { employee, key }
  const [timeAsk, setTimeAsk] = useState(null) // { employee, action }
  const [timeValue, setTimeValue] = useState("")
  const [now, setNow] = useState(nowMinutes)
  const req = useRef(0)
  const isToday = date === today

  const load = useCallback(async (silent = false) => {
    const id = ++req.current
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get("/attendance", { params: { date } })
      if (id !== req.current) return // a newer request superseded this one
      setRows(data)
      setError("")
    } catch (err) {
      console.error(err)
      if (id === req.current) setError("Could not load attendance. Check that the server is running.")
    } finally {
      if (id === req.current && !silent) setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  // Keep "Working 3h 12m" fresh while looking at today
  useEffect(() => {
    if (!isToday) return
    const t = setInterval(() => setNow(nowMinutes()), 30000)
    return () => clearInterval(t)
  }, [isToday])

  const counts = useMemo(() => {
    const c = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, LEAVE: 0, CHECKED_IN: 0, NONE: 0 }
    rows.forEach((e) => { c[bucketOf(e)]++ })
    return c
  }, [rows])

  const departments = useMemo(() => [...new Set(rows.map((e) => e.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((e) => {
      if (filter && bucketOf(e) !== filter) return false
      if (dept && e.department !== dept) return false
      return !q || `${e.name} ${e.employee_code}`.toLowerCase().includes(q)
    })
  }, [rows, filter, dept, query])

  const recorded = rows.length - counts.NONE
  const pct = rows.length ? Math.round((recorded / rows.length) * 100) : 0
  const filtering = !!(filter || dept || query)
  const clearFilters = () => { setFilter(null); setDept(""); setQuery("") }

  // Every press is saved immediately. The server enforces the order and rejects anything else.
  const act = async (employee, action, { status, time } = {}) => {
    const id = employee.employee_id
    const key = status || action
    setBusy((b) => ({ ...b, [id]: key }))
    try {
      const { data } = await api.post(`/attendance/${action}`, { employeeId: id, date, status, time })
      setRows((rs) => rs.map((e) => (e.employee_id === id ? { ...e, status: data.status, check_in: data.check_in, check_out: data.check_out, marked_at: data.marked_at } : e)))
      toast.success(DONE[key](firstName(employee.name)))
      return true
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || "Could not update attendance")
      await load(true) // someone may have changed this employee from another tab; resync
      return false
    } finally {
      setBusy((b) => ({ ...b, [id]: null }))
    }
  }

  const onCheck = (employee) => {
    const action = stageOf(employee) === "checkedIn" ? "check-out" : "check-in"
    if (isToday) return act(employee, action)
    // Past dates can't use "now" - ask for the actual time instead.
    const inMin = toMinutes(employee.check_in)
    setTimeValue(action === "check-in" ? "09:00" : fromMinutes(inMin == null ? 18 * 60 : inMin + 8 * 60))
    setTimeAsk({ employee, action })
  }

  const runConfirm = async () => {
    const { employee, key } = confirm
    const ok = key === "half-day" ? await act(employee, "half-day") : await act(employee, "mark", { status: key })
    if (ok) setConfirm(null)
  }

  const submitTime = async (ev) => {
    ev.preventDefault()
    if (!timeValue) return
    const { employee, action } = timeAsk
    const ok = await act(employee, action, { time: timeValue })
    if (ok) setTimeAsk(null)
  }

  const exportCsv = () =>
    downloadCsv(
      `attendance-${date}.csv`,
      ["Code", "Name", "Department", "Status", "Check in", "Check out", "Worked"],
      rows.map((e) => {
        const s = stageOf(e)
        const worked = e.check_in && e.check_out ? formatDuration(toMinutes(e.check_out) - toMinutes(e.check_in)) : ""
        const label = s === "initial" ? "Not marked" : s === "checkedIn" ? "Checked in" : e.status
        return [e.employee_code, e.name, e.department, label, e.check_in, e.check_out, worked]
      })
    )

  const confirmMeta = confirm ? CONFIRMS[confirm.key] : null
  const confirmBusy = confirm ? !!busy[confirm.employee.employee_id] : false
  const timeBusy = timeAsk ? !!busy[timeAsk.employee.employee_id] : false

  return (
    <div className="space-y-4">
      {error && <ErrorBanner onRetry={() => load()}>{error}</ErrorBanner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-lg" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft /></Button>
          <TextInput type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" aria-label="Attendance date" />
          <Button variant="outline" size="icon-lg" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight /></Button>
          {!isToday && <Button variant="ghost" size="lg" onClick={() => setDate(today)}>Back to today</Button>}
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted-foreground md:block">{longDate(date)}{isToday && <span className="ml-2 align-middle"><Badge variant="info">Today</Badge></span>}</p>
          <Button variant="outline" size="lg" onClick={exportCsv} disabled={loading || rows.length === 0}><Download /> Export</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <StatStrip
          layoutId="att-stat"
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          items={CELLS.map((c) => ({ ...c, value: counts[c.key], active: filter === c.key, onClick: () => setFilter(filter === c.key ? null : c.key) }))}
        />
        <div className="flex items-center gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
          <span className="tabular-nums"><span className="font-medium text-foreground">{recorded}</span> of {rows.length} recorded</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Employees recorded">
            <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
          </div>
          <span className="w-9 text-right tabular-nums">{pct}%</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search name or code" />
          <select aria-label="Filter by department" value={dept} onChange={(e) => setDept(e.target.value)} className={cn(selectClass, "w-full sm:w-auto")}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {filtering && <Button variant="ghost" size="lg" onClick={clearFilters}>Clear filters</Button>}
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">{visible.length} {visible.length === 1 ? "employee" : "employees"}</p>
        </div>

        {loading ? (
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
              <Link to="/employees" className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85">Go to employees</Link>
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
        )}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => { if (!confirmBusy) setConfirm(null) }}
        onConfirm={runConfirm}
        busy={confirmBusy}
        tone={confirmMeta?.tone}
        title={confirmMeta?.title ?? ""}
        confirmLabel={confirmMeta?.label}
      >
        {confirm && <p>{confirmMeta.body(confirm.employee.name, longDate(date))}</p>}
      </ConfirmDialog>

      <Modal
        open={!!timeAsk}
        onClose={() => { if (!timeBusy) setTimeAsk(null) }}
        busy={timeBusy}
        size="sm"
        title={timeAsk?.action === "check-out" ? "Set check-out time" : "Set check-in time"}
        description={timeAsk ? `${timeAsk.employee.name} · ${longDate(date)}` : ""}
        onSubmit={submitTime}
        footer={
          <>
            <Button type="button" variant="outline" size="lg" disabled={timeBusy} onClick={() => setTimeAsk(null)}>Cancel</Button>
            <Button type="submit" size="lg" disabled={timeBusy || !timeValue}>
              {timeBusy && <Loader2 className="animate-spin" />}
              {timeAsk?.action === "check-out" ? "Check Out" : "Check In"}
            </Button>
          </>
        }
      >
        <Field label={timeAsk?.action === "check-out" ? "Check-out time" : "Check-in time"} htmlFor="att-time" hint="This is a past date, so enter the actual time instead of using the current time.">
          <TextInput id="att-time" type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} required />
        </Field>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Monthly report                                                      */
/* ------------------------------------------------------------------ */
const REPORT_PAGE = 10

function MonthlyReport() {
  const thisMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [raw, setRaw] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState({ key: "name", dir: "asc" })
  const [page, setPage] = useState(1)
  const req = useRef(0)

  const load = useCallback(async () => {
    const id = ++req.current
    setLoading(true)
    try {
      const { data } = await api.get("/attendance/summary", { params: { month } })
      if (id !== req.current) return
      setRaw(data)
      setError("")
    } catch (err) {
      console.error(err)
      if (id === req.current) setError("Could not load the monthly report.")
    } finally {
      if (id === req.current) setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [query, sort, month])

  // Attendance % = (present + half days x 0.5) / (present + half days + absent). Leave isn't counted against anyone.
  const data = useMemo(
    () =>
      raw.map((r) => {
        const present = Number(r.present), half = Number(r.half_day), absent = Number(r.absent), leave = Number(r.on_leave)
        const base = present + half + absent
        return { ...r, present, half, absent, leave, pct: base ? Math.round(((present + half * 0.5) / base) * 100) : null }
      }),
    [raw]
  )

  const totals = useMemo(() => {
    const scored = data.filter((r) => r.pct !== null)
    return {
      employees: data.length,
      avg: scored.length ? Math.round(scored.reduce((s, r) => s + r.pct, 0) / scored.length) : null,
      present: data.reduce((s, r) => s + r.present, 0),
      half: data.reduce((s, r) => s + r.half, 0),
      absent: data.reduce((s, r) => s + r.absent, 0),
      leave: data.reduce((s, r) => s + r.leave, 0),
    }
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.filter((r) => !q || `${r.name} ${r.employee_code} ${r.department || ""}`.toLowerCase().includes(q))
    const sign = sort.dir === "asc" ? 1 : -1
    return list.sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * sign
      const av = a[sort.key], bv = b[sort.key]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return (av - bv) * sign
    })
  }, [data, query, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE))
  const safePage = Math.min(page, pages)
  const visible = filtered.slice((safePage - 1) * REPORT_PAGE, safePage * REPORT_PAGE)
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }))

  const exportCsv = () =>
    downloadCsv(
      `attendance-report-${month}.csv`,
      ["Code", "Name", "Department", "Attendance %", "Present", "Half day", "Leave", "Absent"],
      filtered.map((r) => [r.employee_code, r.name, r.department, r.pct === null ? "" : r.pct, r.present, r.half, r.leave, r.absent])
    )

  return (
    <div className="space-y-4">
      {error && <ErrorBanner onRetry={load}>{error}</ErrorBanner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-lg" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></Button>
          <TextInput type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" aria-label="Month" />
          <Button variant="outline" size="icon-lg" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></Button>
          {month !== thisMonth && <Button variant="ghost" size="lg" onClick={() => setMonth(thisMonth)}>This month</Button>}
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted-foreground md:block">{monthLabel(month)}</p>
          <Button variant="outline" size="lg" onClick={exportCsv} disabled={loading || filtered.length === 0}><Download /> Export</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <StatStrip
          cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          items={[
            { key: "emp", label: "Employees", value: totals.employees, tone: "neutral" },
            { key: "avg", label: "Average attendance", value: totals.avg === null ? "-" : `${totals.avg}%`, tone: "info" },
            { key: "present", label: "Present days", value: totals.present, tone: "success" },
            { key: "half", label: "Half days", value: totals.half, tone: "warning" },
            { key: "absent", label: "Absent days", value: totals.absent, tone: "danger" },
            { key: "leave", label: "Leave days", value: totals.leave, tone: "info" },
          ]}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search name, code or department" />
          <p className="ml-auto text-sm text-muted-foreground tabular-nums">{filtered.length} {filtered.length === 1 ? "employee" : "employees"}</p>
        </div>

        {loading ? (
          <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading report">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={query ? SearchX : CalendarCheck} title={query ? "No matching employees" : "Nothing to report"}>
            {query ? "Try a different name, code or department." : "Active employees will be listed here once they exist."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-xs text-muted-foreground">
                  <SortHeader label="Employee" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="Attendance" k="pct" sort={sort} onSort={onSort} className="w-56" />
                  <SortHeader label="Present" k="present" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Half day" k="half" sort={sort} onSort={onSort} align="right" className="hidden sm:table-cell" />
                  <SortHeader label="Leave" k="leave" sort={sort} onSort={onSort} align="right" className="hidden sm:table-cell" />
                  <SortHeader label="Absent" k="absent" sort={sort} onSort={onSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.employee_id} className="border-t transition-colors first:border-t-0 hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{r.employee_code} · {r.department || "No department"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {r.pct === null ? (
                        <span className="text-muted-foreground">No records</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <motion.div className={cn("h-full rounded-full", r.pct >= 90 ? "bg-success" : r.pct >= 75 ? "bg-warning" : "bg-destructive")} initial={{ width: 0 }} animate={{ width: `${r.pct}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
                          </div>
                          <span className="w-10 text-right text-xs font-medium tabular-nums">{r.pct}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-success">{r.present}</td>
                    <td className="hidden px-5 py-3 text-right tabular-nums sm:table-cell">{r.half}</td>
                    <td className="hidden px-5 py-3 text-right tabular-nums sm:table-cell">{r.leave}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-destructive">{r.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && <Pagination page={safePage} pageSize={REPORT_PAGE} total={filtered.length} onPage={setPage} noun="employees" />}
        <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          Attendance % = (present days + half days × 0.5) ÷ recorded working days. Leave isn't counted against anyone.
        </p>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
const TABS = [["daily", "Daily sheet"], ["monthly", "Monthly report"]]

export default function Attendance() {
  const [tab, setTab] = useState("daily")
  return (
    <>
      <PageHeader title="Attendance" description="Record who is in today and review the month." />
      <div role="tablist" aria-label="Attendance views" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("relative rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50", tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {tab === key && <motion.span layoutId="att-tab" className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-black/5" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      {tab === "daily" ? <DailySheet /> : <MonthlyReport />}
    </>
  )
}

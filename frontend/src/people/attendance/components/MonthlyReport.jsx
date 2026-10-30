import { localDate, shiftMonth, monthLabel } from "@/lib/format"
import { useState, useMemo } from "react"
import { useGetAttendanceSummaryQuery } from "@/people/attendance/attendanceApi"
import { downloadCsv } from "@/lib/csv"
import ErrorBanner from "@/components/ErrorBanner"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Download, SearchX, CalendarCheck } from "lucide-react"
import { TextInput } from "@/components/FormField"
import { Card } from "@/components/ui/card"
import StatStrip from "@/components/StatStrip"
import SearchBar from "@/components/SearchBar"
import { EmptyState } from "@/components/feedback"
import SortHeader from "@/components/SortHeader"
import Avatar from "@/components/Avatar"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import Pagination from "@/components/Pagination"
import { useChanged } from "@/lib/useChanged"

/* ------------------------------------------------------------------ */
/* Monthly report                                                      */
/* ------------------------------------------------------------------ */
const REPORT_PAGE = 10
const NO_ROWS = []

export function MonthlyReport() {
  const thisMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const summary = useGetAttendanceSummaryQuery(month)
  const raw = summary.currentData ?? NO_ROWS
  // the skeleton only while a month has nothing to show yet (not on a background refresh)
  const loading = summary.isFetching && !summary.currentData
  const error = summary.error ? "Could not load the monthly report." : ""
  const load = summary.refetch
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState({ key: "name", dir: "asc" })
  const [page, setPage] = useState(1)
  if (useChanged(`${query}|${sort.key}|${sort.dir}|${month}`) && page !== 1) setPage(1)

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
          layoutId="att-report-stat"
          items={[
            { key: "name", label: "Employees", value: totals.employees, tone: "neutral" },
            { key: "pct", label: "Average attendance", value: totals.avg === null ? "-" : `${totals.avg}%`, tone: "info" },
            { key: "present", label: "Present days", value: totals.present, tone: "success" },
            { key: "half", label: "Half days", value: totals.half, tone: "warning" },
            { key: "absent", label: "Absent days", value: totals.absent, tone: "danger" },
            { key: "leave", label: "Leave days", value: totals.leave, tone: "info" },
          ].map((it) => ({ ...it, active: sort.key === it.key, onClick: () => onSort(it.key) }))}
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
                <tr className="border-b bg-cf-head text-[11px] font-bold uppercase tracking-[0.5px] text-cf-faint">
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

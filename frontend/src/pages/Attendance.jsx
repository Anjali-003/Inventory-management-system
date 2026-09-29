import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { CalendarCheck, Check, Loader2, Users } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { cn } from "../lib/utils"

const OPTIONS = [
  { value: "PRESENT", label: "Present", on: "bg-success text-white" },
  { value: "ABSENT", label: "Absent", on: "bg-destructive text-white" },
  { value: "HALF_DAY", label: "Half day", on: "bg-warning text-white" },
  { value: "LEAVE", label: "Leave", on: "bg-primary text-white" },
]

const localDate = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function DailySheet() {
  const [date, setDate] = useState(localDate())
  const [rows, setRows] = useState([])
  const [marks, setMarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    api
      .get("/attendance", { params: { date } })
      .then((r) => {
        if (!active) return
        setRows(r.data)
        setMarks(Object.fromEntries(r.data.map((e) => [e.employee_id, { status: e.status || "", checkIn: e.check_in || "", checkOut: e.check_out || "" }])))
      })
      .catch((err) => {
        console.error(err)
        if (active) setMessage({ tone: "error", text: "Could not load attendance. Check that the server is running." })
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [date])

  const update = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...m[id], ...patch } }))

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, none: 0 }
    rows.forEach((e) => { const s = marks[e.employee_id]?.status; s ? c[s]++ : c.none++ })
    return c
  }, [rows, marks])

  const markRest = () => setMarks((m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, v.status ? v : { ...v, status: "PRESENT" }])))

  const save = async () => {
    const records = rows
      .filter((e) => marks[e.employee_id]?.status)
      .map((e) => ({ employeeId: e.employee_id, status: marks[e.employee_id].status, checkIn: marks[e.employee_id].checkIn || null, checkOut: marks[e.employee_id].checkOut || null }))
    if (records.length === 0) return setMessage({ tone: "error", text: "Mark at least one employee before saving." })
    try {
      setSaving(true)
      setMessage(null)
      await api.post("/attendance/bulk", { date, records })
      setMessage({ tone: "success", text: `Attendance saved for ${records.length} employee${records.length > 1 ? "s" : ""}.` })
    } catch (err) {
      console.error(err)
      setMessage({ tone: "error", text: err.response?.data?.message || "Failed to save attendance" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
      <Card className="overflow-hidden">
        <CardHeader className="flex-wrap items-center">
          <div>
            <CardTitle>Daily attendance</CardTitle>
            <CardDescription>
              {counts.PRESENT} present · {counts.ABSENT} absent · {counts.HALF_DAY} half day · {counts.LEAVE} leave · {counts.none} not marked
            </CardDescription>
          </div>
          <Input type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" aria-label="Attendance date" />
        </CardHeader>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No active employees">Add employees first, then come back to mark attendance.</EmptyState>
        ) : (
          <ul className="divide-y">
            {rows.map((e) => {
              const m = marks[e.employee_id] || {}
              const worked = m.status === "PRESENT" || m.status === "HALF_DAY"
              return (
                <li key={e.employee_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.employee_code} · {e.department || "No department"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {worked && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Input type="time" aria-label="Check in" value={m.checkIn} onChange={(ev) => update(e.employee_id, { checkIn: ev.target.value })} className="h-8 w-28 px-2 text-xs" />
                        to
                        <Input type="time" aria-label="Check out" value={m.checkOut} onChange={(ev) => update(e.employee_id, { checkOut: ev.target.value })} className="h-8 w-28 px-2 text-xs" />
                      </motion.div>
                    )}
                    <div role="group" aria-label={`Status for ${e.name}`} className="inline-flex overflow-hidden rounded-md border">
                      {OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={m.status === o.value}
                          onClick={() => update(e.employee_id, { status: o.value })}
                          className={cn("border-r px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0", m.status === o.value ? o.on : "bg-background text-muted-foreground hover:bg-muted")}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && rows.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/50 px-5 py-3">
            <Button variant="outline" size="lg" onClick={markRest} disabled={counts.none === 0}>Mark unmarked as present</Button>
            <Button size="lg" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? "Saving" : "Save attendance"}
            </Button>
          </div>
        )}
      </Card>
    </>
  )
}

function MonthlyReport() {
  const [month, setMonth] = useState(localDate().slice(0, 7))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get("/attendance/summary", { params: { month } })
      .then((r) => { if (active) { setRows(r.data); setError("") } })
      .catch((err) => { console.error(err); if (active) setError("Could not load the monthly report.") })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [month])

  return (
    <>
      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}
      <Card className="overflow-hidden">
        <CardHeader className="flex-wrap items-center">
          <div>
            <CardTitle>Monthly report</CardTitle>
            <CardDescription>Attendance % = (present + half days × 0.5) ÷ marked working days. Leave is not counted against anyone.</CardDescription>
          </div>
          <Input type="month" value={month} max={localDate().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" aria-label="Month" />
        </CardHeader>
        {loading ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nothing to report">Active employees will be listed here once they exist.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="w-48">Attendance</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Half day</TableHead>
                <TableHead className="text-right">Leave</TableHead>
                <TableHead className="text-right">Absent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const present = Number(r.present), half = Number(r.half_day), absent = Number(r.absent)
                const base = present + half + absent
                const pct = base ? Math.round(((present + half * 0.5) / base) * 100) : null
                return (
                  <TableRow key={r.employee_id}>
                    <TableCell>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.employee_code} · {r.department || "No department"}</p>
                    </TableCell>
                    <TableCell>
                      {pct === null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <motion.div className={cn("h-full rounded-full", pct >= 90 ? "bg-success" : pct >= 75 ? "bg-warning" : "bg-destructive")} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                          </div>
                          <span className="w-10 text-right text-xs font-medium tabular-nums">{pct}%</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">{present}</TableCell>
                    <TableCell className="text-right tabular-nums">{half}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.on_leave)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{absent}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}

export default function Attendance() {
  const [tab, setTab] = useState("daily")
  return (
    <>
      <PageHeader title="Attendance" description="Mark daily attendance and review the month." />
      <div role="tablist" className="mb-4 flex gap-1 border-b">
        {[["daily", "Daily sheet"], ["monthly", "Monthly report"]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("relative px-4 py-2.5 text-sm font-medium transition-colors", tab === key ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            {label}
            {tab === key && <motion.span layoutId="att-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>
      {tab === "daily" ? <DailySheet /> : <MonthlyReport />}
    </>
  )
}

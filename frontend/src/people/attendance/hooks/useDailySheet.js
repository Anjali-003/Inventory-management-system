import { useToast } from "@/components/toast"
import { localDate, nowMinutes, firstName, toMinutes, fromMinutes, formatDuration } from "@/lib/format"
import { useState, useEffect, useMemo } from "react"
import { useGetAttendanceQuery, useMarkAttendanceMutation } from "../attendanceApi"
import { bucketOf, DONE, stageOf, CONFIRMS } from "../attendanceFlow"
import { downloadCsv } from "@/lib/csv"

const EMPTY = []

export default function useDailySheet() {
  const toast = useToast()
  const today = localDate()
  const [date, setDate] = useState(today)
  // The sheet lives in the shared cache (the Dashboard reads today's sheet too); changing `date` loads another day.
  const { data, currentData, isFetching, error: loadError, refetch: load } = useGetAttendanceQuery(date)
  const [markAttendance] = useMarkAttendanceMutation()
  const rows = data ?? EMPTY
  // skeleton on the first load and when moving to another day; not while resyncing after an error
  const loading = isFetching && currentData === undefined
  const error = loadError ? "Could not load attendance. Check that the server is running." : ""
  const [busy, setBusy] = useState({})
  const [query, setQuery] = useState("")
  const [dept, setDept] = useState("")
  const [filter, setFilter] = useState(null)
  const [confirm, setConfirm] = useState(null) // { employee, key }
  const [timeAsk, setTimeAsk] = useState(null) // { employee, action }
  const [timeValue, setTimeValue] = useState("")
  const [now, setNow] = useState(nowMinutes)
  const isToday = date === today

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
      // the new row values are written into the cached sheet by markAttendance (see attendanceApi.js)
      await markAttendance({ action, employeeId: id, date, status, time }).unwrap()
      toast.success(DONE[key](firstName(employee.name)))
      return true
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.message || "Could not update attendance")
      await load() // someone may have changed this employee from another tab; resync
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

  return {
    today,
    date,
    setDate,
    rows,
    loading,
    error,
    busy,
    query,
    setQuery,
    dept,
    setDept,
    filter,
    setFilter,
    confirm,
    setConfirm,
    timeAsk,
    setTimeAsk,
    timeValue,
    setTimeValue,
    now,
    isToday,
    load,
    counts,
    departments,
    visible,
    recorded,
    pct,
    filtering,
    clearFilters,
    onCheck,
    runConfirm,
    submitTime,
    exportCsv,
    confirmMeta,
    confirmBusy,
    timeBusy,
  };
}

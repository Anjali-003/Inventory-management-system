import { shiftDate, longDate } from "@/lib/format"
import { CELLS } from "../attendanceFlow"
import ErrorBanner from "@/components/ErrorBanner"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Download } from "lucide-react"
import { TextInput, selectClass } from "@/components/FormField"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import StatStrip from "@/components/StatStrip"
import { motion } from "motion/react"
import SearchBar from "@/components/SearchBar"
import { cn } from "@/lib/utils"
import TimePromptModal from "./TimePromptModal"
import ConfirmMarkDialog from "./ConfirmMarkDialog"
import AttendanceList from "./AttendanceList"
import useDailySheet from "../hooks/useDailySheet"

export function DailySheet() {
  const {
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
  } = useDailySheet()

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

        {<AttendanceList busy={busy} clearFilters={clearFilters} isToday={isToday} loading={loading} now={now} onCheck={onCheck} rows={rows} setConfirm={setConfirm} visible={visible} />}
      </Card>

      <ConfirmMarkDialog confirm={confirm} confirmBusy={confirmBusy} confirmMeta={confirmMeta} date={date} runConfirm={runConfirm} setConfirm={setConfirm} />

      <TimePromptModal date={date} setTimeAsk={setTimeAsk} setTimeValue={setTimeValue} submitTime={submitTime} timeAsk={timeAsk} timeBusy={timeBusy} timeValue={timeValue} />
    </div>
  )
}

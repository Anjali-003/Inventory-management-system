import { useState } from "react"
import { motion } from "motion/react"
import PageHeader from "@/components/PageHeader"
import { cn } from "@/lib/utils"
import { DailySheet } from "./components/DailySheet"
import { MonthlyReport } from "./components/MonthlyReport"

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

import { AlertTriangle, CheckCircle2, ClipboardList, Factory } from "lucide-react"
import { StatCard } from "@/components/HistoryUI"
import {
  getActiveProduction,
  getCompletedTodayCount,
  getMaterialIssues,
  getTodayTaskCount,
} from "@/features/production-dashboard/productionDashboardUtils"

export default function ProductionOverviewCards({ items, loading }) {
  const active = getActiveProduction(items)
  const shortages = getMaterialIssues(items).filter((item) => item.material_status === "SHORTAGE")

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard index={0} icon={ClipboardList} tone="blue" label="Today's tasks" value={getTodayTaskCount(items)} loading={loading} detail="Orders created or started today" />
      <StatCard index={1} icon={Factory} tone="green" label="Active production" value={active.length} loading={loading} detail="Runs with units in progress" />
      <StatCard index={2} icon={AlertTriangle} tone={shortages.length ? "red" : "green"} label="Material shortages" value={shortages.length} loading={loading} detail={shortages.length ? "Orders that need material attention" : "No material shortages"} />
      <StatCard index={3} icon={CheckCircle2} tone="green" label="Completed today" value={getCompletedTodayCount(items)} loading={loading} detail="Production runs finished today" />
    </div>
  )
}

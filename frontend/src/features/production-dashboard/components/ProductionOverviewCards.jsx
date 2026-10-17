import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, Factory, Wrench } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { StatCard } from "@/components/HistoryUI"
import {
  getActiveProduction,
  getCompletedTodayCount,
  getMaterialIssues,
  getTodayTaskCount,
} from "@/features/production-dashboard/productionDashboardUtils"

export default function ProductionOverviewCards({ items, loading }) {
  const navigate = useNavigate()
  const active = getActiveProduction(items)
  const shortages = getMaterialIssues(items).filter((item) => item.material_status === "SHORTAGE")
  const qcFailed = items.filter((item) => item.rework_status === "NEEDS_REWORK")
  const rework = items.filter((item) => item.rework_status === "IN_PROGRESS")
  const readyForQc = items.filter((item) => item.rework_status === "READY_FOR_QC")

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <StatCard index={0} icon={ClipboardList} tone="blue" label="Today's tasks" value={getTodayTaskCount(items)} loading={loading} detail="Open production to review today's orders" onClick={() => navigate("/production")} />
      <StatCard index={1} icon={Factory} tone="green" label="Active production" value={active.length} loading={loading} detail="Open runs and update progress" onClick={() => navigate("/production")} />
      <StatCard index={2} icon={AlertTriangle} tone={shortages.length ? "red" : "green"} label="Material shortages" value={shortages.length} loading={loading} detail={shortages.length ? "Open orders to check missing parts" : "No material shortages reported"} onClick={() => navigate("/production")} />
      <StatCard index={3} icon={CheckCircle2} tone="green" label="Completed today" value={getCompletedTodayCount(items)} loading={loading} detail="Open production to review completed work" onClick={() => navigate("/production")} />
      <StatCard index={4} icon={AlertTriangle} tone={qcFailed.length ? "red" : "green"} label="QC failed" value={qcFailed.length} loading={loading} detail="Open QC Failed to record a correction" onClick={() => navigate("/qc-failed")} />
      <StatCard index={5} icon={Wrench} tone={rework.length ? "blue" : "green"} label="Rework in progress" value={rework.length} loading={loading} detail="Open QC Failed to finish a repair" onClick={() => navigate("/qc-failed")} />
      <StatCard index={6} icon={ClipboardCheck} tone={readyForQc.length ? "blue" : "green"} label="Ready for QC" value={readyForQc.length} loading={loading} detail="Open QC Failed to review submitted repairs" onClick={() => navigate("/qc-failed")} />
    </div>
  )
}

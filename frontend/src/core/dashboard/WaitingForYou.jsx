import { CheckCircle2 } from "lucide-react"
import { usePermissions } from "@/core/auth/usePermissions"
import { useGetTrackedOrdersQuery } from "@/core/order-tracker/orderTrackerApi"
import { ListPanel, useDrill } from "./DashboardKit"

const STUCK_DAYS = 3

/*
  Top of a role's dashboard: the orders whose next step is THIS role's, oldest wait first, from the Order Tracker
  (same stages and owners everywhere). A click opens that order's journey.
*/
export default function WaitingForYou({ className, title = "Waiting for you today" }) {
  const drill = useDrill()
  const { role } = usePermissions()
  const { data = [], isLoading } = useGetTrackedOrdersQuery()
  const rows = data
    .filter((o) => o.waitingFor && (o.waitingFor === role || role === "SUPER_ADMIN"))
    .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0))
    .map((o) => ({
      id: `w${o.id}`,
      title: o.orderNumber,
      sub: o.stage,
      right: `${o.daysWaiting ?? 0} d`,
      badge: o.daysWaiting >= STUCK_DAYS ? { variant: "danger", label: "Stuck" } : undefined,
      to: `/order-tracker?order=${o.id}`,
    }))

  return (
    <>
      <ListPanel drill={drill} loading={isLoading} className={className} title={title}
        description="Orders where the next step is yours, longest wait first."
        rows={rows} to="/order-tracker" toLabel="Open Order Tracker" emptyIcon={CheckCircle2} empty="Nothing is waiting for you" />
      {drill.host}
    </>
  )
}

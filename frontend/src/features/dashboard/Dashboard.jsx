import { useGetMeQuery } from "@/features/auth/authApi"
import ProductionDashboard from "@/features/production-dashboard/ProductionDashboard"
import GeneralDashboard from "@/features/dashboard/GeneralDashboard"
import QualityFinishedGoodsDashboard from "@/features/quality-fg-dashboard/QualityFinishedGoodsDashboard"

/** Keep the existing dashboard for other roles and show a production-focused view to Production Manager. */
export default function Dashboard() {
  const { data: user, isLoading } = useGetMeQuery()

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading dashboard">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl border bg-card" />)}
        </div>
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </div>
    )
  }

  const role = String(user?.role || "").toUpperCase()

  if (role === "PRODUCTION_MANAGER") return <ProductionDashboard />
  if (role === "QUALITY_FG_MANAGER") return <QualityFinishedGoodsDashboard />
  return <GeneralDashboard />
}

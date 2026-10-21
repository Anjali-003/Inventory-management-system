import { ArrowLeft } from "lucide-react"
import { Link, Navigate, useSearchParams } from "react-router-dom"
import { usePermissions } from "@/features/auth/usePermissions"
import { ROLES } from "@/lib/permissions"
import IqcView from "./roles/IqcView"
import MarketingView from "./roles/MarketingView"
import OperationsView from "./roles/OperationsView"
import PurchaseView from "./roles/PurchaseView"
import StoreView from "./roles/StoreView"
import SuperAdminView from "./roles/SuperAdminView"

/*
  One dashboard per role, all on /dashboard. Each view only asks the server for data that role is allowed to read,
  starts with "Hello, <name>", and every figure / list row opens a popup with the records behind it.
  TO ADD A NEW ROLE: make roles/<Name>View.jsx (copy IqcView) and add it to VIEWS.
*/
const VIEWS = {
  [ROLES.SUPER_ADMIN]: SuperAdminView,
  [ROLES.STORE_MANAGER]: StoreView,
  [ROLES.IQC_MANAGER]: IqcView,
  [ROLES.PURCHASE_MANAGER]: PurchaseView,
  [ROLES.OPERATIONS_ADMIN]: OperationsView,
  [ROLES.MARKETING_MANAGER]: MarketingView,
}

/*
  A role can open another department's MAIN dashboard (read-only) with /dashboard?dept=iqc, ?dept=store or ?dept=purchase.
  Used by the Department Overview cards on the Purchase, IQC and Store dashboards. Allowed only if the role may view that department's pages.
*/
const DEPT_VIEWS = {
  iqc: { label: "IQC", module: "iqc", View: IqcView },
  store: { label: "Store", module: "inventory", View: StoreView },
  purchase: { label: "Purchase", module: "purchase", View: PurchaseView },
}

export default function Dashboard() {
  const { role, loading, homePath, canView } = usePermissions()
  const [params] = useSearchParams()
  if (loading) return null
  const dept = DEPT_VIEWS[params.get("dept")]
  if (dept && canView(dept.module)) {
    const { View } = dept
    return (
      <>
        <Link to="/dashboard" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to my dashboard
        </Link>
        <View readOnly />
      </>
    )
  }
  const View = VIEWS[String(role || "").toUpperCase()]
  if (!View) return homePath && homePath !== "/dashboard" ? <Navigate to={homePath} replace /> : null
  return <View />
}

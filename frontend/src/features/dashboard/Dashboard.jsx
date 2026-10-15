import { Navigate } from "react-router-dom"
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

export default function Dashboard() {
  const { role, loading, homePath } = usePermissions()
  if (loading) return null
  const View = VIEWS[String(role || "").toUpperCase()]
  if (!View) return homePath && homePath !== "/dashboard" ? <Navigate to={homePath} replace /> : null
  return <View />
}

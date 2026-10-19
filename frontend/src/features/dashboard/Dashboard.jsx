
import { Navigate } from "react-router-dom";

import { useGetMeQuery } from "@/features/auth/authApi";
import { usePermissions } from "@/features/auth/usePermissions";
import { ROLES } from "@/lib/permissions";

import ProductionDashboard from "@/features/production-dashboard/ProductionDashboard";
import GeneralDashboard from "@/features/dashboard/GeneralDashboard";
import QualityFinishedGoodsDashboard from "@/features/quality-fg-dashboard/QualityFinishedGoodsDashboard";

import IqcView from "./roles/IqcView";
import MarketingView from "./roles/MarketingView";
import OperationsView from "./roles/OperationsView";
import PurchaseView from "./roles/PurchaseView";
import StoreView from "./roles/StoreView";
import SuperAdminView from "./roles/SuperAdminView";
import HRView from "./roles/HRView";

/*
  One dashboard per role, all on /dashboard.

  Production Manager       -> ProductionDashboard
  Quality FG Manager       -> QualityFinishedGoodsDashboard
  Other configured roles   -> Their respective role views
  Remaining roles          -> GeneralDashboard

  TO ADD A NEW ROLE:
  1. Create roles/<Name>View.jsx
  2. Import the component
  3. Add it to VIEWS below
*/

const VIEWS = {
  [ROLES.SUPER_ADMIN]: SuperAdminView,
  [ROLES.STORE_MANAGER]: StoreView,
  [ROLES.IQC_MANAGER]: IqcView,
  [ROLES.PURCHASE_MANAGER]: PurchaseView,
  [ROLES.OPERATIONS_ADMIN]: OperationsView,
  [ROLES.MARKETING_MANAGER]: MarketingView,
  [ROLES.HR_MANAGER]: HRView,
};

export default function Dashboard() {
  const { data: user, isLoading: userLoading } = useGetMeQuery();
  const { role: permissionRole, loading: permissionsLoading, homePath } =
    usePermissions();

  // Wait for authentication and permissions to load.
  if (userLoading || permissionsLoading) {
    return (
      <div className="space-y-4" aria-label="Loading dashboard">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>

        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </div>
    );
  }

  // Prefer the role returned by the permissions hook.
  // Fall back to the authenticated user's role.
  const role = String(
    permissionRole || user?.role || ""
  ).toUpperCase();

  // Specialized dashboards.
  if (role === "PRODUCTION_MANAGER") {
    return <ProductionDashboard />;
  }

  if (role === "QUALITY_FG_MANAGER") {
    return <QualityFinishedGoodsDashboard />;
  }

  // Role-specific dashboards.
  const View = VIEWS[role];

  if (View) {
    return <View />;
  }

  // Redirect users whose roles have a different home page.
  if (homePath && homePath !== "/dashboard") {
    return <Navigate to={homePath} replace />;
  }

  // Default dashboard for all other roles.
  return <GeneralDashboard />;
}

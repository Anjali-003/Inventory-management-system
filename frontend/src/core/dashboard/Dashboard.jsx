
import { ArrowLeft } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import { useGetMeQuery } from "@/core/auth/authApi";
import { usePermissions } from "@/core/auth/usePermissions";
import { ROLES } from "@/lib/permissions";

import ProductionDashboard from "@/production/dashboards/ProductionDashboard";
import GeneralDashboard from "@/core/dashboard/GeneralDashboard";
import QualityFinishedGoodsDashboard from "@/production/dashboards/QualityFinishedGoodsDashboard";

import IqcView from "../../purchase/dashboards/IqcView";
import MarketingView from "../../sales/dashboards/MarketingView";
import OperationsView from "../../sales/dashboards/OperationsView";
import PurchaseView from "../../purchase/dashboards/PurchaseView";
import StoreView from "../../store/dashboards/StoreView";
import SuperAdminView from "./SuperAdminView";
import HRView from "../../people/dashboards/HRView";
import ProductionAdminView from "../../production/dashboards/ProductionAdminView";

/*
  One dashboard per role, all on /dashboard.

  Production Manager       -> ProductionDashboard
  Production Admin         -> ProductionAdminView
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
  [ROLES.PRODUCTION_ADMIN]: ProductionAdminView,
};

/*
  A role can open another department's MAIN dashboard
  in read-only mode using:
  /dashboard?dept=iqc
  /dashboard?dept=store
  /dashboard?dept=purchase

  Used by the Department Overview cards on the Purchase,
  IQC and Store dashboards.

  Access is allowed only if the role can view that department.
*/
const DEPT_VIEWS = {
  iqc: {
    label: "IQC",
    module: "iqc",
    View: IqcView,
  },
  store: {
    label: "Store",
    module: "inventory",
    View: StoreView,
  },
  purchase: {
    label: "Purchase",
    module: "purchase",
    View: PurchaseView,
  },
  // the other departments, so the Super Admin (CEO) can see any team's own screen from the dashboard
  marketing: { label: "Marketing", module: "marketingOrders", View: MarketingView },
  operations: { label: "Operations", module: "orderApprovals", View: OperationsView },
  production: { label: "Production", module: "production", View: ProductionDashboard },
  quality: { label: "QC & Finished Goods", module: "qualityControl", View: QualityFinishedGoodsDashboard },
  hr: { label: "HR", module: "employees", View: HRView },
};

export default function Dashboard() {
  const { data: user, isLoading: userLoading } = useGetMeQuery();

  const {
    role: permissionRole,
    loading: permissionsLoading,
    homePath,
    canView,
  } = usePermissions();

  const [params] = useSearchParams();

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

  // Cross-department dashboard access in read-only mode.
  const dept = DEPT_VIEWS[params.get("dept")];

  if (dept && canView(dept.module)) {
    const { View } = dept;

    return (
      <>
        <Link
          to="/dashboard"
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to my dashboard
        </Link>

        <View readOnly />
      </>
    );
  }

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


import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { useGetInventoryQuery } from "@/features/inventory/inventoryApi";
import { usePermissions } from "@/features/auth/usePermissions";
import { useGetFinishedGoodsQuery } from "@/features/finished-goods/finishedGoodsApi";
import {
  useGetIncomingStockQuery,
  useGetPurchasesQuery,
} from "@/features/purchasing/purchasingApi";
import { useGetMaterialRequestsQuery } from "@/features/material-requests/materialRequestsApi";
import { Button } from "@/components/ui/button";
import DepartmentOverview from "../DepartmentOverview";
import { Greeting, ListPanel, StatRow, useDrill } from "../DashboardKit";
import {
  finishedRow,
  incomingRow,
  isLowStock,
  onOrderByComponent,
  stockRow,
} from "../rows";

const EMPTY = [];
const ACCEPT_PAGE = "/incoming-stock?status=PENDING_STORE";

/*
 * readOnly: displayed to another role (e.g. Purchase Manager)
 * from its Department Overview. Hides material-allotment actions.
 */
export default function StoreView({ readOnly = false }) {
  const drill = useDrill();
  const navigate = useNavigate();
  const { canView } = usePermissions();

  // Store managers with incoming-stock access can go directly to acceptance.
  const direct = !readOnly && canView("incomingStock");

  const inv = useGetInventoryQuery("active");
  const fg = useGetFinishedGoodsQuery();
  const inc = useGetIncomingStockQuery();

  // Used to calculate component quantities that are already on order.
  const buys = useGetPurchasesQuery();

  // Material requests are fetched only when the full Store view is shown.
  const requests = useGetMaterialRequestsQuery(undefined, {
    skip: readOnly,
  });

  const pendingMaterialRequests = (requests.data ?? EMPTY).filter(
    (request) => request.status !== "ISSUED"
  );

  const loading =
    inv.isLoading || fg.isLoading || inc.isLoading;

  const dashboardLoading =
    loading || buys.isLoading || (!readOnly && requests.isLoading);

  const { low, waiting, packaging, dispatched } = useMemo(() => {
    const onOrder = onOrderByComponent(buys.data);

    return {
      low: (inv.data ?? EMPTY)
        .filter(isLowStock)
        .map((item) =>
          stockRow(item, onOrder.get(item.component_id))
        ),

      waiting: (inc.data ?? EMPTY)
        .filter((item) => item.status === "PENDING_STORE")
        .map((item) =>
          direct
            ? { ...incomingRow(item), to: ACCEPT_PAGE }
            : incomingRow(item)
        ),

      packaging: (fg.data ?? EMPTY)
        .filter((item) => item.status === "PACKAGING")
        .map(finishedRow),

      dispatched: (fg.data ?? EMPTY)
        .filter((item) => item.status === "DISPATCHED")
        .map(finishedRow),
    };
  }, [inv.data, fg.data, inc.data, buys.data, direct]);

  return (
    <>
      <Greeting description="What is waiting for the store today." />

      {!readOnly && (
        <div
          className={`mb-4 overflow-hidden rounded-xl border ${
            pendingMaterialRequests.length
              ? "border-amber-300 bg-gradient-to-r from-amber-50 via-white to-emerald-50"
              : "border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50"
          }`}
        >
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                  pendingMaterialRequests.length
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                <ClipboardList className="size-5" />
              </div>

              <div className="min-w-0">
                <p className="font-semibold">
                  Production material requests
                </p>

                <p className="mt-0.5 text-sm text-muted-foreground">
                  {requests.isLoading
                    ? "Checking material requests…"
                    : pendingMaterialRequests.length
                      ? `${pendingMaterialRequests.length} request${
                          pendingMaterialRequests.length === 1
                            ? " is"
                            : "s are"
                        } waiting for a full or partial allotment.`
                      : "No material requests are waiting. New requests from Production will appear here."}
                </p>
              </div>
            </div>

            <Button
              onClick={() => navigate("/store-material-requests")}
              className="shrink-0"
            >
              Open Material Allotment
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <StatRow
        drill={drill}
        stats={[
          {
            label: "To accept into stock",
            value: waiting.length,
            icon: PackageCheck,
            tone: waiting.length ? "amber" : "green",
            loading: dashboardLoading,
            detail: "Approved by IQC",
            to: direct
              ? ACCEPT_PAGE
              : "/store-status?status=ACCEPT",
          },
          {
            label: "At or below minimum",
            value: low.length,
            icon: AlertTriangle,
            tone: low.length ? "amber" : "green",
            loading: dashboardLoading,
            detail: low.length ? "Needs reordering" : "All stocked up",
            to: "/store-status?status=LOW",
          },
          {
            label: "In packaging",
            value: packaging.length,
            icon: Warehouse,
            tone: "blue",
            loading: dashboardLoading,
            detail: "Ready to dispatch",
            to: "/store-status?status=PACKAGING",
          },
          {
            label: "Dispatched",
            value: dispatched.length,
            icon: Truck,
            tone: "violet",
            loading: dashboardLoading,
            detail: "Waiting to be completed",
            to: "/store-status?status=DISPATCHED",
          },
        ]}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListPanel
          drill={drill}
          loading={dashboardLoading}
          title="Incoming stock to accept"
          description="IQC-approved purchases."
          rows={waiting}
          to={direct ? ACCEPT_PAGE : "/incoming-stock"}
          toLabel={direct ? "Accept now" : "Open Incoming Stock"}
          emptyIcon={PackageCheck}
          empty="Nothing waiting for the store"
        />

        <ListPanel
          drill={drill}
          loading={dashboardLoading}
          title="Components to reorder"
          description="Stock on hand is at or below the minimum."
          rows={low}
          to="/inventory?filter=low"
          toLabel="Open Inventory"
          emptyIcon={PackageCheck}
          empty="All components are above minimum"
        />

        <ListPanel
          drill={drill}
          loading={dashboardLoading}
          className="lg:col-span-2"
          title="Finished goods in packaging"
          description="Mark them dispatched from the Finished Goods page."
          rows={packaging}
          to="/finished-goods"
          toLabel="Open Finished Goods"
          emptyIcon={Warehouse}
          empty="No batch in packaging"
        />
      </div>

      <DepartmentOverview
        className="mt-4"
        depts={["iqc", "purchase"]}
      />

      {drill.host}
    </>
  );
}

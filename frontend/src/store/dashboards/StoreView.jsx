
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardList,
  PackageCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { useGetInventoryQuery } from "@/store/inventory/inventoryApi";
import { usePermissions } from "@/core/auth/usePermissions";
import { useGetFinishedGoodsQuery } from "@/production/finished-goods/finishedGoodsApi";
import {
  useGetIncomingStockQuery,
  useGetPurchasesQuery,
} from "@/purchase/shared/purchasingApi";
import { useGetMaterialRequestsQuery } from "@/store/material-requests/materialRequestsApi";
import { Button } from "@/components/ui/button";
import DepartmentOverview from "../../core/dashboard/DepartmentOverview";
import { Greeting, ListPanel, StatRow, useDrill } from "../../core/dashboard/DashboardKit";
import {
  finishedRow,
  incomingRow,
  isLowStock,
  onOrderByComponent,
  stockRow,
} from "../../core/dashboard/rows";
import WaitingForYou from "@/core/dashboard/WaitingForYou"

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
  // the finished-goods steps are Store's own work, so only Store (not a read-only viewer) loads them
  const fg = useGetFinishedGoodsQuery(undefined, { skip: readOnly || !canView("finishedGoods") });
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

  const { low, waiting, toReceive, toGiveOut } = useMemo(() => {
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

      // handed over by Operations Admin: count and receive into product stock
      toReceive: (fg.data ?? EMPTY)
        .filter((item) => item.status === "HANDED_OVER")
        .map((item) => ({ ...finishedRow(item), to: "/finished-goods" })),

      // billed by Marketing: give the goods out for delivery
      toGiveOut: (fg.data ?? EMPTY)
        .filter((item) => item.status === "BILLED")
        .map((item) => ({ ...finishedRow(item), to: "/finished-goods" })),
    };
  }, [inv.data, fg.data, inc.data, buys.data, direct]);

  const material = pendingMaterialRequests.length;
  // the one thing to do first: Production waiting on material stops the floor, then goods to accept and hand out
  const nudge = readOnly
    ? "What the Store has in hand right now."
    : material
      ? `Production is waiting for material on ${material} request${material === 1 ? "" : "s"}. Hand it over first.`
      : waiting.length
        ? `${waiting.length} IQC-approved purchase${waiting.length === 1 ? "" : "s"} to accept into stock.`
        : toGiveOut.length
          ? `${toGiveOut.length} billed order${toGiveOut.length === 1 ? "" : "s"} to give out for delivery.`
          : "Nothing is waiting for the Store right now.";

  return (
    <>
      <Greeting description={nudge}>
        {!readOnly && <Button onClick={() => navigate("/store-material-requests")}><ClipboardList /> Issue to Production</Button>}
      </Greeting>

      <StatRow
        drill={drill}
        stats={[
          !readOnly && {
            label: "Material for Production",
            value: material,
            icon: ClipboardList,
            tone: material ? "red" : "green",
            loading: requests.isLoading,
            detail: material ? "Requests waiting for you" : "Nothing to hand over",
            to: "/store-material-requests",
          },
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
            label: "Goods to receive",
            value: toReceive.length,
            icon: Warehouse,
            tone: toReceive.length ? "amber" : "green",
            loading: dashboardLoading,
            detail: "Handed over by Ops Admin",
            to: "/finished-goods",
          },
          {
            label: "Goods to give out",
            value: toGiveOut.length,
            icon: Truck,
            tone: toGiveOut.length ? "amber" : "green",
            loading: dashboardLoading,
            detail: "Billed by Marketing",
            to: "/finished-goods",
          },
        ]}
      />

      {!readOnly && <WaitingForYou className="mt-4" />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListPanel
          drill={drill}
          loading={dashboardLoading}
          title="Incoming stock to accept"
          description="IQC-approved purchases."
          rows={waiting}
          to={direct ? ACCEPT_PAGE : "/incoming-stock"}
          toLabel={direct ? "Accept now" : "Open Receive from IQC"}
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

        {!readOnly && (
          <ListPanel
            drill={drill}
            loading={dashboardLoading}
            className="lg:col-span-2"
            title="Finished goods waiting for you"
            description="Receive what Ops Admin handed over; give out what Marketing has billed."
            rows={[...toReceive, ...toGiveOut]}
            to="/finished-goods"
            toLabel="Open Finished Goods"
            emptyIcon={Warehouse}
            empty="Nothing to receive or give out"
          />
        )}
      </div>

      <DepartmentOverview
        className="mt-4"
        depts={["iqc", "purchase"]}
      />

      {drill.host}
    </>
  );
}

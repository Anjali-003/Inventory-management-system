import { EmptyState, Notice, TableSkeleton } from "@/components/feedback";
import UserCell from "@/components/UserCell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { timeAgo } from "@/core/activity/time";
import { usePermissions } from "@/core/auth/usePermissions";
import {
  HeroButton,
  MktBtn,
  MktHero,
  SearchField,
  StageChips,
  StageTile,
  StatusPill,
  StatusSelect,
} from "@/sales/marketing-orders/mktKit";
import { stagger } from "@/sales/marketing-orders/mktMotion";
import {
  CustomerName,
  OrderValue,
  countByStatus,
  declinedOf,
  reviewOf,
  newestFirst,
  plural,
  stageOf,
} from "@/sales/marketing-orders/orderParts";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { ArrowRight, ClipboardCheck, RefreshCw, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useUrlState } from "@/lib/useUrlState";
import { OPS_TABS } from "./FeasibilityTab";
import OpsOrderDrawer from "./OpsOrderDrawer";
import {
  ApprovalPageCard,
  OPS_ALL,
  OPS_STAGES,
  RevisionTag,
  OpsTileGrid,
  isDecided,
  isOpsStatus,
} from "./opsKit";
import { canApprove, planTotals, planVerdict } from "./approvalParts";
import {
  useGetOrderApprovalsQuery,
  useGetOrderPlanQuery,
} from "./orderApprovalsApi";

const EMPTY = [];
const SHOW_LINES = 2;
const QUEUE = "PENDING_APPROVAL";

/*
  Operations Admin: every order that came in (e.g. from the marketing team) and whether it is approved.
  "al" is the work queue, so the page opens on it. Each waiting order shows right away how much
  of it can be built from the stock on the shelf. Clicking an order, or its "Review order" button, always opens the
  same drawer (OpsOrderDrawer): the details, the stock check, and the three decisions Reject · Revise quantity ·
  Approve. Once approved, the order is sent on in two separate steps: what the stock can build to the Production
  Manager, the missing components to the Purchase Manager. Reject needs a reason.

  Same layout as the Marketing Orders page: the orders are a table while the list box is 1024px wide or more,
  otherwise each order is a card (container query, so it follows the room the list really has next to the sidebar).
  The status filter is a scrolling row of chips on a phone, colour tiles on a tablet and a dropdown on a desktop (lg+).

  The page state lives in the URL, so a link (or a click on a dashboard figure) opens it already set up:
    ?status=PENDING_APPROVAL | APPROVED | REJECTED | ALL   filter (no status = the waiting queue)
    ?q=text                                               search
    ?order=12&tab=feasibility                             that order's drawer (and tab)
*/

/* Table-only cells, worded so each one reads on its own (the card view keeps its own wording). */
function ProductsCell({ order }) {
  const items = order.items;
  const [open, setOpen] = useState(false);
  const extra = items.length - SHOW_LINES;
  const lines = open ? items : items.slice(0, SHOW_LINES);
  return (
    <ul className="space-y-0.5 text-sm leading-snug">
      {lines.map((it) => (
        <li key={it.product_id}>
          {it.name}{" "}
          <span className="font-medium tabular-nums text-muted-foreground">
            × {fmtQty(it.quantity)}
          </span>
        </li>
      ))}
      {extra > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="text-xs font-semibold text-primary outline-none hover:underline focus-visible:underline"
          >
            {open ? "Show less" : `+${extra} more`}
          </button>
        </li>
      )}
      <li>
        <OrderValue order={order} />
      </li>
    </ul>
  );
}

/* Table cell: the verdict and two numbers. The full lists are one click away in the order drawer. */
function FeasibilityCell({ orderId }) {
  const { data: plan, isLoading, error } = useGetOrderPlanQuery(orderId);
  if (isLoading)
    return <span className="text-xs text-muted-foreground">Checking stock...</span>;
  if (error || !plan)
    return <span className="text-xs text-muted-foreground">Stock check unavailable</span>;
  const verdict = planVerdict(plan);
  const { ordered, canMake } = planTotals(plan);
  const toBuy = plan.shortages?.length || 0;
  return (
    <div className="space-y-1 text-xs leading-snug">
      <Badge variant={verdict.variant}>{verdict.label}</Badge>
      <p>
        <b className="font-semibold tabular-nums">{fmtQty(canMake)}</b>
        <span className="text-muted-foreground"> of {fmtQty(ordered)} units can be made now</span>
      </p>
      {toBuy > 0 && (
        <p className="font-semibold text-destructive">{plural(toBuy, "component")} to buy</p>
      )}
    </div>
  );
}

function ReviewCell({ order, actions }) {
  const declined = declinedOf(order);
  if (declined) {
    return (
      <div className="space-y-0.5">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Cancelled by {declined.who}
        </span>
        {declined.who === "Marketing" && <UserCell name={declined.by} sub={declined.at ? fmtDateTime(declined.at) : ""} />}
        <p className="max-w-64 whitespace-normal text-xs text-muted-foreground">
          {declined.why}
        </p>
      </div>
    );
  }
  if (!isDecided(order)) {
    return (
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-muted-foreground">
          Waiting for your decision
        </span>
        {actions}
      </div>
    );
  }
  const approved = order.approval_status === "APPROVED";
  const { requested } = reviewOf(order);
  const sent = order.production_request?.items ?? [];
  const sentUnits = sent.reduce((n, i) => n + Number(i.quantity || 0), 0);
  return (
    <div className="space-y-0.5">
      <span
        className={cn(
          "block text-[11px] font-bold uppercase tracking-wide",
          approved ? "text-emerald-700" : "text-rose-700",
        )}
      >
        {approved ? "Approved" : "Rejected"}
      </span>
      <UserCell
        name={order.approved_by_name}
        sub={fmtDateTime(order.approved_at)}
      />
      {approved && (
        <p className="text-xs text-muted-foreground">
          Ordered:{" "}
          <b className="font-semibold tabular-nums text-foreground">
            {fmtQty(requested)}
          </b>{" "}
          units
          {sent.length > 0 && (
            <>
              {" · "}
              <span className="tabular-nums">{fmtQty(sentUnits)}</span> to Production
            </>
          )}
        </p>
      )}
      {approved && order.left_to_send > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-semibold text-warning">
            {fmtQty(order.left_to_send)} units not sent to Production yet
          </p>
          {actions}
        </div>
      )}
      {order.approval_remarks && (
        <p className="line-clamp-2 max-w-64 whitespace-normal text-xs text-muted-foreground">
          {approved ? "Remarks" : "Reason"}: {order.approval_remarks}
        </p>
      )}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function OrderApprovals() {
  const { canEdit } = usePermissions();
  const editable = canEdit("orderApprovals");

  const { params, patch, openPopup, closePopup } = useUrlState();
  const rawStatus = params.get("status");
  const status =
    rawStatus === "ALL" ? null : isOpsStatus(rawStatus) ? rawStatus : QUEUE; // null = every order
  const query = params.get("q") ?? "";
  const orderId = params.get("order");
  // no tab in the URL: the drawer opens where the work is (Stock check for a waiting order)
  const tab = OPS_TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : undefined;

  const {
    data = EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetOrderApprovalsQuery();
  // "Needs your decision" also holds approved orders whose rest can be approved now that parts came in
  const counts = useMemo(() => ({ ...countByStatus(data), [QUEUE]: data.filter(canApprove).length }), [data]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data]
      .sort(newestFirst)
      .filter(
        (o) =>
          (!status || (status === QUEUE ? canApprove(o) : o.approval_status === status)) &&
          (!q ||
            o.order_number.toLowerCase().includes(q) ||
            (o.customer_name || "").toLowerCase().includes(q) ||
            (o.created_by_name || "").toLowerCase().includes(q) ||
            o.items.some(
              (i) =>
                i.name.toLowerCase().includes(q) ||
                (i.sku || "").toLowerCase().includes(q),
            )),
      );
  }, [data, query, status]);

  const filtered = !!(status || query.trim());
  const clearFilters = () => patch({ status: "ALL", q: null });
  const openOrder = (o) => openPopup({ order: o.id });
  // "Review order": the same drawer, straight on the stock check, where all three decisions are
  const reviewOrder = (o) => openPopup({ order: o.id, tab: "feasibility" });
  const closeOrder = () => closePopup({ order: null, tab: null });

  // Same list feeds the tiles (md and up) and the chips (phones).
  const filters = [
    {
      key: "ALL",
      stage: OPS_ALL,
      value: counts.total,
      active: !status,
      onClick: () => patch({ status: "ALL" }),
    },
    ...OPS_STAGES.map((s) => ({
      key: s.status,
      stage: s,
      value: counts[s.status],
      active: status === s.status,
      onClick: () => patch({ status: status === s.status ? "ALL" : s.status }),
    })),
  ];

  return (
    <MotionConfig reducedMotion="user">
      <MktHero
        eyebrow="Operations"
        title="Orders to Approve"
        description="Open an order to see what the current stock can build, then send it on, revise its quantity, or reject it."
      >
        <HeroButton
          variant="glass"
          onClick={refetch}
          disabled={isFetching}
          aria-label="Refresh orders"
        >
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </HeroButton>
      </MktHero>

      {error && (
        <div className="mb-4">
          <Notice title="Something went wrong">
            Could not load orders. Check that the server is running.
          </Notice>
        </div>
      )}

      {/* filter: chips on a phone, tiles on tablets, a dropdown (in the bar below) on desktop */}
      <div className="hidden md:block lg:hidden">
        <OpsTileGrid>
          {filters.map((f) => (
            <StageTile
              key={f.key}
              stage={f.stage}
              value={f.value}
              loading={isLoading}
              active={f.active}
              onClick={f.onClick}
            />
          ))}
        </OpsTileGrid>
      </div>
      <StageChips
        label="Filter orders by status"
        items={filters.map((f) => ({
          key: f.key,
          label: f.stage.label,
          value: f.value,
          grad: f.stage.s.grad,
          pill: f.stage.s.pill,
          dot: f.stage.dot,
          active: f.active,
          onClick: f.onClick,
        }))}
      />

      {/* search: stays under the top bar while a phone scrolls. On a phone the bar stays one line tall:
          the count and the removable filter tag are for bigger screens (the chips already show the filter). */}
      <div className="mkt-glass sticky top-14 z-20 -mx-4 mt-3 flex items-center gap-3 px-4 py-2.5 md:static md:mx-0 md:mt-8 md:bg-transparent lg:mt-0 md:p-0 md:pb-4 md:shadow-none md:backdrop-blur-none">
        <SearchField
          className="min-w-0 flex-1 sm:max-w-xs sm:flex-none"
          value={query}
          onChange={(v) => patch({ q: v }, true)}
          placeholder="Search order, product or who raised it..."
        />
        <StatusSelect
          className="hidden shrink-0 lg:block"
          label="Filter orders by status"
          items={filters.map((f) => ({
            key: f.key,
            label: f.stage.label,
            short: f.stage.short,
            value: f.value,
            dot: f.stage.dot,
            active: f.active,
            onClick: f.onClick,
          }))}
        />
        <div
          className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:min-h-8 sm:flex-1 sm:flex-wrap sm:justify-end"
          aria-live="polite"
        >
          <span className="hidden tabular-nums sm:inline">
            Showing {shown.length} of {counts.total}
          </span>
          {status && (
            <span className="hidden sm:inline-flex lg:hidden">
              <motion.span
                key={status}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full py-1 ps-2.5 pe-1 font-semibold ring-1 ring-inset",
                  stageOf(status).s.pill,
                )}
              >
                {stageOf(status).label}
                <button
                  type="button"
                  aria-label={`Remove ${stageOf(status).label} filter`}
                  onClick={() => patch({ status: "ALL" })}
                  className="grid size-5 place-items-center rounded-full outline-none transition-colors hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <X className="size-3" />
                </button>
              </motion.span>
            </span>
          )}
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="whitespace-nowrap font-semibold text-primary outline-none hover:underline focus-visible:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* the list follows the width of its own box (not the screen), so the table is never squeezed */}
      <div className="@container">
      {isLoading ? (
        <>
          <div className="@5xl:hidden">
            <CardsSkeleton />
          </div>
          <Card className="hidden overflow-hidden @5xl:block">
            <TableSkeleton />
          </Card>
        </>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title={
              status === QUEUE && !query.trim()
                ? "Nothing waiting for approval"
                : "No order matches"
            }
          >
            {status === QUEUE && !query.trim()
              ? "New orders will show up here as soon as they are raised."
              : status && !query.trim() && counts[status] === 0
                ? `There are no ${stageOf(status).label.toLowerCase()} orders right now.`
                : "Try a different search or filter."}
            {filtered && !(status === QUEUE && !query.trim()) && (
              <span className="mt-4 flex justify-center gap-2">
                <MktBtn onClick={clearFilters}>Show all orders</MktBtn>
              </span>
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* phones + tablets: cards. Keyed by the filter so they rise in again whenever it changes. */}
          <motion.div
            key={`cards-${status ?? "all"}`}
            variants={stagger(0.045)}
            initial="hidden"
            animate="show"
            className="grid gap-3 @2xl:grid-cols-2 @5xl:hidden"
          >
            {shown.map((o) => (
              <ApprovalPageCard
                key={o.id}
                order={o}
                canAct={editable}
                onOpen={openOrder}
                onReview={reviewOrder}
              />
            ))}
          </motion.div>

          {/* desktop: table */}
          <Card className="hidden overflow-hidden @5xl:block">
            <Table data-cards="off">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8! px-3!">Order</TableHead>
                  <TableHead className="h-8! px-3!">Products</TableHead>
                  <TableHead className="h-8! px-3!">Status</TableHead>
                  <TableHead className="h-8! px-3!">Stock check</TableHead>
                  <TableHead className="h-8! px-3!">Decision</TableHead>
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={status ?? "all"}>
                {shown.map((o, i) => {
                  const approvable = canApprove(o); // waiting, or partly approved and open for the rest
                  return (
                    <TableRow
                      key={o.id}
                      onClick={() => openOrder(o)}
                      style={{
                        animationDelay: `${Math.min(i, 8) * 30}ms`,
                        animationFillMode: "backwards",
                      }}
                      className="cursor-pointer motion-reduce:animate-none"
                    >
                      <TableCell className="px-3! py-1! align-top! min-w-44">
                        <button
                          type="button"
                          className="block text-start font-semibold tabular-nums outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:underline"
                        >
                          {o.order_number}
                        </button>
                        <CustomerName order={o} />
                        <span
                          className="block text-xs text-muted-foreground"
                          title={fmtDateTime(o.created_at)}
                        >
                          {o.created_by_name
                            ? `Raised by ${o.created_by_name} · `
                            : "Raised "}
                          {timeAgo(o.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-56">
                        <ProductsCell order={o} />
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top!">
                        <StatusPill
                          value={o.approval_status}
                          className="px-2! py-0.5! text-[11px]!"
                        />
                        <RevisionTag order={o} />
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-52 whitespace-normal">
                        {approvable ? (
                          <FeasibilityCell orderId={o.id} />
                        ) : (
                          <span className="text-muted-foreground">Already decided</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-60">
                        <ReviewCell
                          order={o}
                          actions={
                            editable && approvable ? (
                              <MktBtn
                                variant="primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reviewOrder(o);
                                }}
                                aria-label={`Review ${o.order_number}`}
                              >
                                Review order <ArrowRight />
                              </MktBtn>
                            ) : null
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
      </div>

      {/* the one order drawer (also used by the dashboard): details, stock check and the three decisions */}
      <OpsOrderDrawer
        orderId={orderId}
        tab={tab}
        onTab={(t) => patch({ tab: t }, true)}
        onClose={closeOrder}
      />
    </MotionConfig>
  );
}

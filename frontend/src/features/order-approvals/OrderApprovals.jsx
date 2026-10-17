import { EmptyState, Notice, TableSkeleton } from "@/components/feedback";
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
import { timeAgo } from "@/features/activity/time";
import { usePermissions } from "@/features/auth/usePermissions";
import {
  HeroButton,
  MktBtn,
  MktHero,
  SearchField,
  StageChips,
  StageTile,
  StatusPill,
  StatusSelect,
} from "@/features/marketing-orders/mktKit";
import { stagger } from "@/features/marketing-orders/mktMotion";
import {
  OrderProgress,
  countByStatus,
  newestFirst,
  plural,
  stageOf,
} from "@/features/marketing-orders/orderParts";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { ClipboardCheck, PackageCheck, RefreshCw, X } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ApprovalDetailModal from "./ApprovalDetailModal";
import DecisionModal from "./DecisionModal";
import OrderPlanModal from "./OrderPlanModal";
import PlanSummary from "./PlanSummary";
import {
  ApprovalPageCard,
  DecisionCell,
  OPS_ALL,
  OPS_STAGES,
  OpsTileGrid,
  isOpsStatus,
} from "./opsKit";
import { approveLabel, canApprove } from "./approvalParts";
import { useGetOrderApprovalsQuery } from "./orderApprovalsApi";

const EMPTY = [];
const SHOW_LINES = 2;
const QUEUE = "PENDING_APPROVAL";

/*
  Operations Admin: every order that came in (e.g. from the marketing team) and whether it is approved.
  "al" is the work queue, so the page opens on it. Each waiting order shows right away how much
  of it can be built from the stock on the shelf. "Check stock & send" opens the plan: the producible list goes to
  the Production Manager and the list of missing components goes to the Purchase Manager. Reject needs a reason.

  Same layout as the Marketing Orders page: the orders are a table while the list box is 1024px wide or more,
  otherwise each order is a card (container query, so it follows the room the list really has next to the sidebar).
  The status filter is a scrolling row of chips on a phone, colour tiles on a tablet and a dropdown on a desktop (lg+).

  The page state lives in the URL, so a link (or a click on a dashboard figure) opens it already set up:
    ?status=PENDING_APPROVAL | APPROVED | REJECTED | ALL   filter (no status = the waiting queue)
    ?q=text                                               search
    ?order=12                                             that order's popup
*/

function CardsSkeleton() {
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border bg-card p-4">
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

  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const status =
    rawStatus === "ALL" ? null : isOpsStatus(rawStatus) ? rawStatus : QUEUE; // null = every order
  const query = params.get("q") ?? "";
  const orderId = params.get("order");

  // `replace` keeps typing in the search box from filling the browser history.
  const patch = (changes, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace },
    );

  const {
    data = EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGetOrderApprovalsQuery();
  const [deciding, setDeciding] = useState(null); // { order, mode } (reject)
  const [planning, setPlanning] = useState(null); // the order whose stock check is open

  const counts = useMemo(() => countByStatus(data), [data]);
  const selected = useMemo(
    () =>
      orderId ? (data.find((o) => String(o.id) === orderId) ?? null) : null,
    [data, orderId],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data]
      .sort(newestFirst)
      .filter(
        (o) =>
          (!status || o.approval_status === status) &&
          (!q ||
            o.order_number.toLowerCase().includes(q) ||
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
  const openOrder = (o) => patch({ order: o.id });
  const askReject = (order) => setDeciding({ order, mode: "reject" });

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
        title="Order Approvals"
        description="See what can be built from current stock, send the lists to Production and Purchase, or reject the order."
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
                onReject={askReject}
                onPlan={setPlanning}
              />
            ))}
          </motion.div>

          {/* desktop: table */}
          <Card className="hidden overflow-hidden @5xl:block">
            <Table data-cards="off">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stock check</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={status ?? "all"}>
                {shown.map((o, i) => {
                  const extra = o.items.length - SHOW_LINES;
                  const pending = o.approval_status === QUEUE;
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
                      <TableCell className="min-w-44">
                        <button
                          type="button"
                          className="block text-start font-semibold tabular-nums outline-none transition-colors hover:text-primary focus-visible:text-primary focus-visible:underline"
                        >
                          {o.order_number}
                        </button>
                        <span
                          className="block text-xs text-muted-foreground"
                          title={fmtDateTime(o.created_at)}
                        >
                          {o.created_by_name ? `${o.created_by_name} · ` : ""}
                          {timeAgo(o.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-56">
                        <ul className="space-y-0.5">
                          {o.items.slice(0, SHOW_LINES).map((it) => (
                            <li key={it.product_id} className="text-sm">
                              {it.name}{" "}
                              <span className="text-muted-foreground">
                                × {fmtQty(it.quantity)}
                              </span>
                            </li>
                          ))}
                          {extra > 0 && (
                            <li className="text-xs font-semibold text-primary">
                              + {plural(extra, "more product")}
                            </li>
                          )}
                        </ul>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <StatusPill value={o.approval_status} />
                          <OrderProgress status={o.approval_status} />
                        </div>
                      </TableCell>
                      <TableCell className="min-w-52 whitespace-normal">
                        {approvable ? (
                          <PlanSummary orderId={o.id} items={o.items} />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-44">
                        <DecisionCell order={o} />
                      </TableCell>
                      <TableCell className="text-end">
                        {editable && approvable && (
                          <div className="flex justify-end gap-2">
                            {pending && (
                              <MktBtn
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  askReject(o);
                                }}
                                aria-label={`Reject ${o.order_number}`}
                              >
                                <X /> Reject
                              </MktBtn>
                            )}
                            <MktBtn
                              variant="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPlanning(o);
                              }}
                              aria-label={`${approveLabel(o)} ${o.order_number}`}
                            >
                              <PackageCheck /> {approveLabel(o)}
                            </MktBtn>
                          </div>
                        )}
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

      {selected && !deciding && !planning && (
        <ApprovalDetailModal
          orderId={selected.id}
          onClose={() => patch({ order: null }, true)}
        />
      )}
      {deciding && (
        <DecisionModal
          order={deciding.order}
          mode={deciding.mode}
          onClose={() => setDeciding(null)}
        />
      )}
      {planning && (
        <OrderPlanModal order={planning} onClose={() => setPlanning(null)} />
      )}
    </MotionConfig>
  );
}

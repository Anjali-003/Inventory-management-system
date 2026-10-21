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
import OrderDrawer from "@/features/marketing-orders/OrderDrawer";
import { stagger } from "@/features/marketing-orders/mktMotion";
import {
  countByStatus,
  reviewOf,
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
import DecisionModal from "./DecisionModal";
import OrderPlanModal from "./OrderPlanModal";
import OpsTimelineTab from "./OpsTimelineTab";
import {
  ApprovalPageCard,
  OPS_ALL,
  OPS_STAGES,
  OpsTileGrid,
  isDecided,
  isOpsStatus,
} from "./opsKit";
import { approveLabel, canApprove, planTotals, planVerdict } from "./approvalParts";
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

/* Table-only cells, worded so each one reads on its own (the card view keeps its own wording). */
function ProductsCell({ items }) {
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
    </ul>
  );
}

function FeasibilityCell({ orderId }) {
  const { data: plan, isLoading, error } = useGetOrderPlanQuery(orderId);
  const [open, setOpen] = useState(false);
  if (isLoading)
    return <span className="text-xs text-muted-foreground">Checking stock...</span>;
  if (error || !plan)
    return <span className="text-xs text-muted-foreground">Stock check unavailable</span>;
  const verdict = planVerdict(plan);
  const { canMake } = planTotals(plan);
  const shortages = plan.shortages || [];
  return (
    <div className="space-y-0.5 text-xs leading-snug">
      <Badge variant={verdict.variant}>{verdict.label}</Badge>
      <p>
        <span className="text-muted-foreground">Feasible: </span>
        <b className="font-semibold tabular-nums">{plural(canMake, "unit")}</b>
      </p>
      {shortages.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            <span className="text-muted-foreground">Shortage: </span>
            <b className="font-semibold tabular-nums text-destructive">
              {plural(shortages.length, "component")}
            </b>
          </span>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="font-semibold text-primary outline-none hover:underline focus-visible:underline"
          >
            {open ? "Hide Details" : "View Details"}
          </button>
        </p>
      )}
      {open && shortages.length > 0 && (
        <ul className="space-y-0.5 border-s-2 border-destructive/30 ps-2">
          {shortages.map((c) => (
            <li key={c.component_id}>
              {c.name || `Component #${c.component_id}`}:{" "}
              <b className="font-semibold tabular-nums text-destructive">
                {fmtQty(c.shortage)}
                {c.unit ? ` ${c.unit}` : ""}
              </b>
              <span className="text-muted-foreground">
                {" "}
                (need {fmtQty(c.required)}, free {fmtQty(c.available)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCell({ order, actions }) {
  if (!isDecided(order)) {
    return (
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-muted-foreground">
          Awaiting review
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
          Approved:{" "}
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
      {order.approval_remarks && (
        <p className="line-clamp-2 max-w-64 whitespace-normal text-xs text-muted-foreground">
          {approved ? "Remarks" : "Reason"}: {order.approval_remarks}
        </p>
      )}
    </div>
  );
}

const OPS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Products" },
  { id: "feasibility", label: "Feasibility" },
  { id: "timeline", label: "Timeline" },
];

/* "Component Feasibility" tab: the live stock check while the order waits; what was handed over once it is decided. */
function FeasibilityTab({ order }) {
  const waiting = canApprove(order);
  const { data: plan, isLoading, error } = useGetOrderPlanQuery(order.id, { skip: !waiting });
  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i.name]));
  const Heading = ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>;
  const Note = ({ children }) => (
    <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">{children}</p>
  );

  if (!waiting) {
    const prod = order.production_request;
    const purch = order.purchase_request;
    return (
      <div className="space-y-5">
        <section>
          <Heading>Sent to Production</Heading>
          {prod?.items?.length ? (
            <ul className="space-y-1 rounded-xl border p-3 text-sm">
              {prod.items.map((i) => (
                <li key={i.product_id} className="flex justify-between gap-3">
                  <span>{i.name}</span>
                  <b className="tabular-nums">{fmtQty(i.quantity)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Note>Nothing was sent to Production.</Note>
          )}
        </section>
        <section>
          <Heading>Components sent to Purchase</Heading>
          {purch?.items?.length ? (
            <ul className="space-y-1 rounded-xl border p-3 text-sm">
              {purch.items.map((i) => (
                <li key={i.component_id} className="flex justify-between gap-3">
                  <span>
                    {i.name}
                    {i.sku ? <span className="text-muted-foreground"> · {i.sku}</span> : null}
                  </span>
                  <b className="tabular-nums">
                    {fmtQty(i.quantity)}
                    {i.unit ? ` ${i.unit}` : ""}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <Note>No components were sent to Purchase.</Note>
          )}
        </section>
      </div>
    );
  }

  if (isLoading) return <Note>Checking stock...</Note>;
  if (error || !plan) return <Note>Stock check unavailable.</Note>;
  const verdict = planVerdict(plan);
  const { ordered, canMake, remaining } = planTotals(plan);
  const shortages = plan.shortages || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
        <span>
          Requested <b className="tabular-nums">{fmtQty(ordered)}</b>
        </span>
        <span>
          Feasible <b className="tabular-nums text-primary">{fmtQty(canMake)}</b>
        </span>
        <span>
          Short{" "}
          <b className={cn("tabular-nums", remaining > 0 && "text-destructive")}>{fmtQty(remaining)}</b>
        </span>
      </div>

      <section>
        <Heading>By product</Heading>
        <div className="overflow-hidden rounded-xl border">
          <Table data-cards="off">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3! h-8!">Product</TableHead>
                <TableHead className="px-3! h-8! text-end">Requested</TableHead>
                <TableHead className="px-3! h-8! text-end">Feasible</TableHead>
                <TableHead className="px-3! h-8! text-end">Short</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plan.lines || []).map((l) => (
                <TableRow key={l.product_id}>
                  <TableCell className="px-3! py-1! whitespace-normal">
                    {names[l.product_id] || `Product #${l.product_id}`}
                  </TableCell>
                  <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(l.ordered)}</TableCell>
                  <TableCell className={cn("px-3! py-1! text-end font-semibold tabular-nums", l.can_make > 0 ? "text-primary" : "text-destructive")}>
                    {fmtQty(l.can_make)}
                  </TableCell>
                  <TableCell className={cn("px-3! py-1! text-end tabular-nums", Number(l.remaining) > 0 && "font-semibold text-destructive")}>
                    {fmtQty(l.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {plan.missing_bom?.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Bill of materials missing for {plural(plan.missing_bom.length, "product")}.
          </p>
        )}
      </section>

      <section>
        <Heading>Components short</Heading>
        {shortages.length === 0 ? (
          <Note>
            {plan.missing_bom?.length
              ? "No shortage can be worked out until the BOM is completed."
              : "Nothing to buy: every component is in stock."}
          </Note>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table data-cards="off">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3! h-8!">Component</TableHead>
                  <TableHead className="px-3! h-8! text-end">Needed</TableHead>
                  <TableHead className="px-3! h-8! text-end">Free</TableHead>
                  <TableHead className="px-3! h-8! text-end">Short</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortages.map((c) => (
                  <TableRow key={c.component_id}>
                    <TableCell className="px-3! py-1! whitespace-normal">
                      {c.name}
                      {c.sku ? <span className="block text-xs text-muted-foreground">{c.sku}</span> : null}
                    </TableCell>
                    <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(c.required)}</TableCell>
                    <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(c.available)}</TableCell>
                    <TableCell className="px-3! py-1! text-end font-semibold tabular-nums text-destructive">
                      {fmtQty(c.shortage)}
                      {c.unit ? ` ${c.unit}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

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
  const tab = OPS_TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "overview";

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
  const closeOrder = () => patch({ order: null, tab: null }, true);
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
        title="Incoming Orders"
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
                  <TableHead className="h-8! px-3!">Order details</TableHead>
                  <TableHead className="h-8! px-3!">Requested products</TableHead>
                  <TableHead className="h-8! px-3!">Approval status</TableHead>
                  <TableHead className="h-8! px-3!">Production feasibility</TableHead>
                  <TableHead className="h-8! px-3!">Review &amp; actions</TableHead>
                </TableRow>
              </TableHeader>
              {/* keyed by the filter so the rows glide in again whenever the filter changes */}
              <TableBody key={status ?? "all"}>
                {shown.map((o, i) => {
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
                      <TableCell className="px-3! py-1! align-top! min-w-44">
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
                          {o.created_by_name
                            ? `Raised by ${o.created_by_name} · `
                            : "Raised "}
                          {timeAgo(o.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-56">
                        <ProductsCell items={o.items} />
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top!">
                        <StatusPill
                          value={o.approval_status}
                          className="px-2! py-0.5! text-[10px]!"
                        />
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-52 whitespace-normal">
                        {approvable ? (
                          <FeasibilityCell orderId={o.id} />
                        ) : (
                          <span className="text-muted-foreground">Not required</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3! py-1! align-top! min-w-60">
                        <ReviewCell
                          order={o}
                          actions={
                            editable && approvable ? (
                              <div className="flex items-center gap-2">
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

      {/* right-side details drawer (same one the Marketing page uses); hidden while a decision popup is open.
          Its Reject / Check stock buttons stay disabled while the list is refetching, so right after a decision
          the drawer cannot be used again on the old (still "waiting") copy of the order. */}
      <OrderDrawer
        order={selected && !deciding && !planning ? selected : null}
        tab={tab}
        onTab={(t) => patch({ tab: t === "overview" ? null : t }, true)}
        onClose={closeOrder}
        tabs={OPS_TABS}
        tabContent={selected ? { feasibility: <FeasibilityTab order={selected} />, timeline: <OpsTimelineTab order={selected} /> } : undefined}
        actions={
          selected && editable && canApprove(selected) ? (
            <>
              {selected.approval_status === QUEUE && (
                <MktBtn variant="danger" disabled={isFetching} onClick={() => askReject(selected)}>
                  <X /> Reject
                </MktBtn>
              )}
              <MktBtn variant="primary" disabled={isFetching} onClick={() => setPlanning(selected)}>
                <PackageCheck /> {approveLabel(selected)}
              </MktBtn>
            </>
          ) : null
        }
      />
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

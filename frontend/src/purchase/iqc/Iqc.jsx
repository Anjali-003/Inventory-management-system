import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, Download, PackageCheck, RefreshCw } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import SearchBar from "@/components/SearchBar"
import UserCell from "@/components/UserCell"
import { EmptyState, Notice, TableSkeleton } from "@/components/feedback"
import { StatCard } from "@/components/HistoryUI"
import { StageChips, StatusSelect } from "@/sales/marketing-orders/mktKit"
import { Accordion } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useGetMeQuery } from "@/core/auth/authApi"
import { usePermissions } from "@/core/auth/usePermissions"
import { useGetIqcQueueQuery } from "@/purchase/shared/purchasingApi"
import { PurchaseDetailModal, PurchaseLines, PurchaseStatus } from "@/purchase/shared/PurchaseParts"
import { WAS_INSPECTED, badLines, badQty, downloadRejected, goodQty, rejectedLines } from "@/purchase/shared/purchasingUtils"
import { fmtDateTime, fmtQty } from "@/lib/stock"
import InspectModal from "./InspectModal"
import IqcPieces from "./IqcPieces"

const EMPTY = []

/*
  /iqc?status=... is where the IQC dashboard figures lead. No status = the whole page (to inspect + inspected).
  ?q=<PO number> searches (the dashboard lists link here).
    PENDING_IQC  only the "To inspect" list        APPROVED   inspected and passed (to store / in stock)
    REJECTED     inspected and rejected            INSPECTED  everything inspected
*/
const VIEWS = {
  PENDING_IQC: { label: "Waiting for inspection" },
  APPROVED: { label: "Approved", title: "Approved", description: "Passed inspection: with the store or already in stock.", statuses: ["PENDING_STORE", "STORED"] },
  REJECTED: { label: "Rejected", title: "Rejected", description: "Nothing from these purchases was approved.", statuses: ["REJECTED"] },
  INSPECTED: { label: "Total inspected", title: "Inspected", description: "What happened to each purchase after the check." },
}

/*
  IQC dashboard (Incoming Quality Control).
  Purchased components land here first. The inspector checks the quantity that arrived and marks
  approved components go on to the store manager, who must accept them into stock.
  The Store Manager can open this page too, but read-only (no Inspect button).
*/
export default function Iqc() {
  const { data: me } = useGetMeQuery()
  const { canEdit } = usePermissions()
  const editable = canEdit("iqc")

  const { data = EMPTY, isLoading, isFetching, error, refetch } = useGetIqcQueueQuery()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get("q") || "") // ?q=<PO number> from the dashboard
  const view = VIEWS[params.get("status")] ? params.get("status") : null // set when a dashboard figure sent us here
  const cfg = view ? VIEWS[view] : null
  const showWaiting = !view || view === "PENDING_IQC"
  const showInspected = !view || view !== "PENDING_IQC"
  const [inspecting, setInspecting] = useState(null) // purchase id (looked up again so the dialog always has fresh data)
  const [viewing, setViewing] = useState(null)

  const byStatus = (s) => data.filter((p) => p.status === s)
  const waiting = byStatus("PENDING_IQC")
  const inspected = data.filter((p) => WAS_INSPECTED(p.status))

  const match = (p) => {
    const q = query.trim().toLowerCase()
    return !q || p.po_number.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
      p.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
  }
  const waitingShown = useMemo(() => waiting.filter(match), [waiting, query]) // eslint-disable-line react-hooks/exhaustive-deps
  const inspectedShown = useMemo(() => inspected.filter((p) => (!cfg?.statuses || cfg.statuses.includes(p.status)) && match(p)), [inspected, query, cfg])  // eslint-disable-line react-hooks/exhaustive-deps

  const toInspect = inspecting ? data.find((p) => p.id === inspecting && p.status === "PENDING_IQC") : null
  const first = (me?.name || "").split(/\s+/)[0]


  const approvedCount = data.filter((p) => ["PENDING_STORE", "STORED"].includes(p.status)).length
  const pick = (k) => () => setParams(k === "ALL" || k === view ? {} : { status: k }, { replace: true })
  const filters = [
    { key: "ALL", label: "All purchases", value: data.length, icon: ClipboardList, tone: "violet", detail: "Everything sent to IQC", grad: "from-violet-600 to-purple-800", pill: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500", active: !view, onClick: pick("ALL") },
    { key: "PENDING_IQC", label: "Waiting for inspection", value: waiting.length, icon: ClipboardList, tone: "amber", detail: "Purchased, not checked yet", grad: "from-amber-700 to-orange-800", pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", active: view === "PENDING_IQC", onClick: pick("PENDING_IQC") },
    { key: "APPROVED", label: "Approved", value: approvedCount, icon: CheckCircle2, tone: "green", detail: "Passed inspection", grad: "from-emerald-700 to-emerald-800", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-600", active: view === "APPROVED", onClick: pick("APPROVED") },
    { key: "REJECTED", label: "Rejected", value: byStatus("REJECTED").length, icon: AlertTriangle, tone: "red", detail: "Nothing approved", grad: "from-rose-600 to-red-800", pill: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500", active: view === "REJECTED", onClick: pick("REJECTED") },
    { key: "INSPECTED", label: "Total inspected", value: inspected.length, icon: PackageCheck, tone: "blue", detail: "All time", grad: "from-sky-700 to-blue-800", pill: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", active: view === "INSPECTED", onClick: pick("INSPECTED") },
  ]

  return (
    <>
      <PageHeader
        title={me?.name ? `Hello, ${me.name}` : "IQC"}
        description={
          waiting.length > 0
            ? `${waiting.length} purchase${waiting.length === 1 ? " is" : "s are"} waiting for your inspection${first ? `, ${first}` : ""}.`
            : "Nothing is waiting for inspection right now."
        }
      >
        <Button variant="outline" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </PageHeader>

      {error && (
        <div className="mb-6">
          <Notice title="Something went wrong">Could not load the IQC queue. Check that the server is running.</Notice>
        </div>
      )}

      {/* the figures are filters: chips on a phone, cards on a tablet, a dropdown on a PC. The chosen one matches the URL. */}
      <div className="mb-4 hidden lg:block">
        <StatusSelect className="w-64" portal label="Filter purchases" items={filters.map((f) => ({ key: f.key, label: f.label, value: f.value, dot: f.dot, active: f.active, onClick: f.onClick }))} />
      </div>
      <StageChips label="Filter purchases" items={filters} />
      <div className="hidden gap-4 sm:grid-cols-2 xl:grid-cols-5 md:grid lg:hidden">
        {filters.map((f, i) => (
          <StatCard key={f.key} index={i} icon={f.icon} tone={f.tone} label={f.label} value={f.value} loading={isLoading} detail={f.detail} active={f.active} onClick={f.onClick} />
        ))}
      </div>

      {showWaiting && (
      <Card id="iqc-waiting" className="mt-4 scroll-mt-4 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>To inspect</CardTitle>
            <CardDescription>Purchases the purchase manager has received and sent to IQC.</CardDescription>
          </div>
          <SearchBar value={query} onChange={setQuery} placeholder="Search PO, supplier or component..." />
        </CardHeader>

        {isLoading ? (
          <TableSkeleton />
        ) : waitingShown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={query ? "No purchase matches your search" : "All caught up"}>
            {query ? "Try a different PO number, supplier or component." : "Purchases show up here once the purchase manager sends them to IQC."}
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {waitingShown.map((p) => (
              <Accordion
                key={p.id}
                as="li"
                headerClassName="flex-wrap gap-x-4 gap-y-2 px-5 py-3.5"
                panelClassName="border-t bg-muted/10 p-4"
                header={
                  <>
                    <p className="font-semibold">{p.po_number} · {p.supplier}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.totals.lines} item{p.totals.lines === 1 ? "" : "s"} · {fmtQty(p.totals.ordered)} pcs ordered
                    </p>
                  </>
                }
                meta={<UserCell name={p.created_by_name} sub={fmtDateTime(p.created_at)} />}
                actions={
                  editable ? (
                    <Button size="sm" onClick={() => setInspecting(p.id)}>Inspect</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setViewing(p)}>View</Button>
                  )
                }
              >
                <PurchaseLines items={p.items} inspected={false} />
              </Accordion>
            ))}
          </ul>
        )}
      </Card>

      )}

      {showInspected && (
      <Card id="iqc-inspected" className="mt-4 scroll-mt-4 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>{cfg?.title || "Inspected"}</CardTitle>
            <CardDescription>{cfg?.description || "What happened to each purchase after the check."}</CardDescription>
          </div>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : inspectedShown.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={query ? "No purchase matches your search" : view ? `Nothing ${cfg.label.toLowerCase()}` : "Nothing inspected yet"}>{query ? "Try a different PO number, supplier or component." : "Inspected purchases and their result appear here."}</EmptyState>
        ) : (
          <ul className="divide-y">
            {inspectedShown.map((p) => {
              const rejected = rejectedLines(p).length
              const good = p.items.reduce((s, i) => s + goodQty(i), 0)
              const bad = p.items.reduce((s, i) => s + badQty(i), 0)
              return (
                <Accordion
                  key={p.id}
                  as="li"
                  headerClassName="flex-wrap gap-x-4 gap-y-2 px-5 py-3.5"
                  panelClassName="border-t bg-muted/10 p-4"
                  header={
                    <>
                      <p className="font-semibold">{p.po_number} · {p.supplier}</p>
                      <p className="text-xs text-muted-foreground">
                        Received {fmtQty(p.totals.received)} · Accepted <span className="font-semibold tabular-nums text-success">{fmtQty(good)}</span> ·{" "}
                        Rejected <span className={bad > 0 ? "font-semibold tabular-nums text-destructive" : "tabular-nums"}>{fmtQty(bad)}</span>
                        {rejected > 0 && <span className="font-semibold text-destructive"> · {rejected} of {p.totals.lines} components rejected</span>}
                      </p>
                    </>
                  }
                  meta={
                    <>
                      <PurchaseStatus value={p.status} />
                      <UserCell name={p.iqc_by_name} sub={fmtDateTime(p.iqc_at)} />
                    </>
                  }
                  actions={
                    <>
                      {badLines(p).length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => downloadRejected(p)}><Download /> Rejected pieces (Excel)</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setViewing(p)}>Details</Button>
                    </>
                  }
                >
                  <PurchaseLines items={p.items} inspected />
                </Accordion>
              )
            })}
          </ul>
        )}
      </Card>
      )}

      {showInspected && <IqcPieces purchases={data} loading={isLoading} query={query} />}

      {toInspect && <InspectModal key={toInspect.id} purchase={toInspect} onClose={() => setInspecting(null)} />}
      <PurchaseDetailModal purchase={viewing && (data.find((p) => p.id === viewing.id) || viewing)} onClose={() => setViewing(null)} />
    </>
  )
}

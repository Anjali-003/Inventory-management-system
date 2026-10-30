import { useMemo } from "react"
import { CheckCircle2, ClipboardCheck, ClipboardList, XCircle } from "lucide-react"
import { useGetIqcQueueQuery } from "@/purchase/shared/purchasingApi"
import DepartmentOverview from "../../core/dashboard/DepartmentOverview"
import { Greeting, ListPanel, StatRow, useDrill } from "../../core/dashboard/DashboardKit"
import { purchaseRow } from "../../core/dashboard/rows"

const EMPTY = []

export default function IqcView() {
  const drill = useDrill()
  const { data = EMPTY, isLoading } = useGetIqcQueueQuery()

  const { waiting, approved, rejected, inspected } = useMemo(() => {
    const rows = (list) => list.map(purchaseRow)
    // the dashboard lists open the IQC Check page with that purchase found (the inspection opens from its own button)
    const toCheck = (list) => list.map((p) => ({ ...purchaseRow(p), to: `/iqc?status=PENDING_IQC&q=${encodeURIComponent(p.po_number)}` }))
    const toResult = (list) => list.map((p) => ({ ...purchaseRow(p), to: `/iqc?status=INSPECTED&q=${encodeURIComponent(p.po_number)}` }))
    return {
      waiting: toCheck(data.filter((p) => p.status === "PENDING_IQC")),
      approved: rows(data.filter((p) => p.status === "PENDING_STORE" || p.status === "STORED")),
      rejected: rows(data.filter((p) => p.status === "REJECTED")),
      inspected: toResult(data.filter((p) => ["PENDING_STORE", "STORED", "REJECTED"].includes(p.status))),
    }
  }, [data])

  return (
    <>
      <Greeting description="Purchases that need inspection, and what has already been inspected." />
      <StatRow
        drill={drill}
        stats={[
          { label: "Total inspected", value: inspected.length, icon: ClipboardList, tone: "blue", loading: isLoading, detail: "All time", to: "/iqc?status=INSPECTED" },
          { label: "Waiting for inspection", value: waiting.length, icon: ClipboardCheck, tone: waiting.length ? "amber" : "green", loading: isLoading, detail: "Sent by purchase", to: "/iqc?status=PENDING_IQC" },
          { label: "Approved", value: approved.length, icon: CheckCircle2, tone: "green", loading: isLoading, detail: "Passed inspection", to: "/iqc?status=APPROVED" },
          { label: "Rejected", value: rejected.length, icon: XCircle, tone: rejected.length ? "violet" : "green", loading: isLoading, detail: "Failed inspection", to: "/iqc?status=REJECTED" },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListPanel drill={drill} loading={isLoading} title="Waiting for inspection" description="Open one to see its components." rows={waiting} to="/iqc" toLabel="Open IQC" emptyIcon={ClipboardCheck} empty="Nothing to inspect" />
        <ListPanel drill={drill} loading={isLoading} title="Recently inspected" description="Approved and rejected purchases." rows={inspected} to="/iqc" toLabel="Open IQC" emptyIcon={ClipboardList} empty="Nothing inspected yet" />
      </div>
      <DepartmentOverview className="mt-4" depts={["purchase", "store"]} />
      {drill.host}
    </>
  )
}

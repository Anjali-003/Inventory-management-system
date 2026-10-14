import { RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SearchBar from "@/components/SearchBar";
import StatStrip from "@/components/StatStrip";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import QcPanel from "./components/QcPanel";
import QcQueue from "./components/QcQueue";
import useQualityControl from "./hooks/useQualityControl";

export default function QualityControl() {
  const {
    loading,
    error,
    query,
    setQuery,
    selected,
    detail,
    stage,
    testingQty,
    setTestingQty,
    qcQty,
    setQcQty,
    testingResult,
    setTestingResult,
    qcResult,
    setQcResult,
    testingRemarks,
    setTestingRemarks,
    qcRemarks,
    setQcRemarks,
    redoPassed,
    setRedoPassed,
    redoApproved,
    setRedoApproved,
    saving,
    load,
    rows,
    totals,
    open,
    close,
    testingMax,
    qcMax,
    testedTotal,
    passedTotal,
    failedTotal,
    qcInspectedTotal,
    qcApprovedTotal,
    qcRejectedTotal,
    newPassedTotal,
    newFailedTotal,
    newQcApprovedTotal,
    newQcRejectedTotal,
    saveTesting,
    saveRedoTesting,
    saveRedoQc,
    saveQc,
  } = useQualityControl();

  return (
    <>
      <PageHeader
        title="Quality Control"
        description="Test produced units, inspect them, and release approved batches to Finished Goods."
      >
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw /> Refresh
        </Button>
      </PageHeader>

      {error && !selected && (
        <div className="mb-4">
          <Notice title="Something went wrong">{error}</Notice>
        </div>
      )}

      <Card className="overflow-hidden">
        <StatStrip
          cols="grid-cols-2 md:grid-cols-4"
          layoutId="qc-summary"
          items={[
            {
              key: "orders",
              label: "Production runs",
              value: totals.orders,
              tone: "info",
            },
            {
              key: "produced",
              label: "Produced",
              value: totals.produced,
              tone: "neutral",
            },
            {
              key: "testing",
              label: "Ready for testing",
              value: totals.readyTesting,
              tone: "warning",
            },
            {
              key: "qc",
              label: "Ready for QC",
              value: totals.readyQc,
              tone: "success",
            },
          ]}
        />

        <div className="border-b px-4 py-3 sm:px-5">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search order, product or SKU..."
          />
        </div>

        {<QcQueue loading={loading} open={open} query={query} rows={rows} />}
      </Card>

      {selected && (
        <QcPanel close={close} detail={detail} error={error} failedTotal={failedTotal} newFailedTotal={newFailedTotal} newPassedTotal={newPassedTotal} newQcApprovedTotal={newQcApprovedTotal} newQcRejectedTotal={newQcRejectedTotal} passedTotal={passedTotal} qcApprovedTotal={qcApprovedTotal} qcInspectedTotal={qcInspectedTotal} qcMax={qcMax} qcQty={qcQty} qcRejectedTotal={qcRejectedTotal} qcRemarks={qcRemarks} qcResult={qcResult} redoApproved={redoApproved} redoPassed={redoPassed} saveQc={saveQc} saveRedoQc={saveRedoQc} saveRedoTesting={saveRedoTesting} saveTesting={saveTesting} saving={saving} selected={selected} setQcQty={setQcQty} setQcRemarks={setQcRemarks} setQcResult={setQcResult} setRedoApproved={setRedoApproved} setRedoPassed={setRedoPassed} setTestingQty={setTestingQty} setTestingRemarks={setTestingRemarks} setTestingResult={setTestingResult} stage={stage} testedTotal={testedTotal} testingMax={testingMax} testingQty={testingQty} testingRemarks={testingRemarks} testingResult={testingResult} />
      )}
    </>
  );
}

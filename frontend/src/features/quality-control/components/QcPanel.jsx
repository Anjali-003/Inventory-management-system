import { n } from "../qcUtils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Notice } from "@/components/feedback";
import QualityControlForm from "./QualityControlForm";
import RedoQcForm from "./RedoQcForm";
import RedoTestingForm from "./RedoTestingForm";
import TestingForm from "./TestingForm";

export default function QcPanel({
  close,
  detail,
  error,
  failedTotal,
  newFailedTotal,
  newPassedTotal,
  newQcApprovedTotal,
  newQcRejectedTotal,
  passedTotal,
  qcApprovedTotal,
  qcInspectedTotal,
  qcMax,
  qcQty,
  qcRejectedTotal,
  qcRemarks,
  qcResult,
  redoApproved,
  redoPassed,
  saveQc,
  saveRedoQc,
  saveRedoTesting,
  saveTesting,
  saving,
  selected,
  setQcQty,
  setQcRemarks,
  setQcResult,
  setRedoApproved,
  setRedoPassed,
  setTestingQty,
  setTestingRemarks,
  setTestingResult,
  stage,
  testedTotal,
  testingMax,
  testingQty,
  testingRemarks,
  testingResult,
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      onMouseDown={(e) =>
        e.target === e.currentTarget && !saving && close()
      }
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Production quality
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {selected.orderNumber}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selected.productName} · Produced{" "}
              {n(detail?.production?.quantityCompleted)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            disabled={saving}
            aria-label="Close"
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="mb-4">
              <Notice title="Inspection error">{error}</Notice>
            </div>
          )}

          {stage === "TESTING" && (
            <TestingForm detail={detail} failedTotal={failedTotal} passedTotal={passedTotal} saveTesting={saveTesting} saving={saving} setTestingQty={setTestingQty} setTestingRemarks={setTestingRemarks} setTestingResult={setTestingResult} testingMax={testingMax} testingQty={testingQty} testingRemarks={testingRemarks} testingResult={testingResult} />
          )}

          {stage === "REDO_TESTING" && (
            <RedoTestingForm close={close} failedTotal={failedTotal} newFailedTotal={newFailedTotal} newPassedTotal={newPassedTotal} passedTotal={passedTotal} redoPassed={redoPassed} saveRedoTesting={saveRedoTesting} saving={saving} setRedoPassed={setRedoPassed} testedTotal={testedTotal} />
          )}

          {stage === "REDO_QC" && (
            <RedoQcForm close={close} newQcApprovedTotal={newQcApprovedTotal} newQcRejectedTotal={newQcRejectedTotal} qcApprovedTotal={qcApprovedTotal} qcInspectedTotal={qcInspectedTotal} qcRejectedTotal={qcRejectedTotal} redoApproved={redoApproved} saveRedoQc={saveRedoQc} saving={saving} setRedoApproved={setRedoApproved} />
          )}

          {stage === "QUALITY_CONTROL" && (
            <QualityControlForm detail={detail} passedTotal={passedTotal} qcMax={qcMax} qcQty={qcQty} qcRemarks={qcRemarks} qcResult={qcResult} saveQc={saveQc} saving={saving} setQcQty={setQcQty} setQcRemarks={setQcRemarks} setQcResult={setQcResult} />
          )}
        </div>
      </div>
    </div>
  );
}

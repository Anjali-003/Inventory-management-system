import { n } from "../qcUtils";
import { Status } from "./QcStatus";
import { Button } from "@/components/saturday/button";
import { FlaskConical, ClipboardCheck } from "lucide-react";
import UserCell from "@/components/UserCell";

export function ProductionCard({ item, onOpen }) {
  const produced = n(item.quantityCompleted);
  const remaining = n(item.remainingToTest);
  const failed = n(item.quantityFailed);
  const qc = n(item.availableForQC);
  const tested = n(item.quantityTested);
  const rejected = n(item.quantityRejected);
  const readyForFinishedGoods = !!item.readyForFinishedGoods;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{item.orderNumber}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {item.productName} · {item.productSku}
          </p>
        </div>
        <Status item={item} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
        {[
          ["Produced", produced],
          ["Tested", tested],
          ["QC ready", qc],
        ].map(([label, value]) => (
          <div key={label} className="bg-card py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {remaining > 0
          ? `${remaining} unit(s) waiting for testing.`
          : `${tested} unit(s) tested.`}
        {failed > 0 && ` ${failed} failed unit(s) need a redo.`}
      </p>
      {(item.lastTestedBy || item.lastCheckedBy) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {item.lastTestedBy && <UserCell name={item.lastTestedBy} sub="Last tested by" />}
          {item.lastCheckedBy && <UserCell name={item.lastCheckedBy} sub="Last checked by" />}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
        {(remaining > 0 || failed > 0) && (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => onOpen(item, "TESTING")}
          >
            <FlaskConical /> Testing
          </Button>
        )}

        {failed > 0 && (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => onOpen(item, "REDO_TESTING")}
          >
            <FlaskConical /> Edit Testing
          </Button>
        )}

        {remaining <= 0 && failed === 0 && qc > 0 && (
          <Button
            className="flex-1"
            onClick={() => onOpen(item, "QUALITY_CONTROL")}
          >
            <ClipboardCheck /> QC
          </Button>
        )}

        {remaining <= 0 && failed === 0 && rejected > 0 && (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => onOpen(item, "REDO_QC")}
          >
            <ClipboardCheck /> Edit QC
          </Button>
        )}

        {readyForFinishedGoods && (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => (window.location.href = "/finished-goods")}
          >
            View Finished Goods
          </Button>
        )}
      </div>
    </div>
  );
}

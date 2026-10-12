import { n } from "../qcUtils";
import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function QualityControlForm({
  detail,
  passedTotal,
  qcMax,
  qcQty,
  qcRemarks,
  qcResult,
  saveQc,
  saving,
  setQcQty,
  setQcRemarks,
  setQcResult,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Passed from Testing
          </p>
          <p className="text-xl font-semibold">{passedTotal}</p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">Inspected</p>
          <p className="text-xl font-semibold">
            {n(detail?.qualityControl?.quantityInspected)}
          </p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Ready for QC
          </p>
          <p className="text-xl font-semibold">{qcMax}</p>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <Label htmlFor="qc-qty">Quantity to inspect</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="qc-qty"
            type="text"
            inputMode="numeric"
            value={qcQty}
            onChange={(e) => setQcQty(e.target.value)}
            disabled={qcMax <= 0}
          />
          <Button
            variant="outline"
            disabled={qcMax <= 0}
            onClick={() => setQcQty(String(qcMax))}
          >
            Max
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Maximum available: {qcMax}
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-medium">
          Overall QC result
        </p>
        <div className="flex gap-2">
          <Button
            variant={qcResult === "PASS" ? "default" : "outline"}
            onClick={() => setQcResult("PASS")}
          >
            PASS
          </Button>
          <Button
            variant={
              qcResult === "FAIL" ? "destructive" : "outline"
            }
            onClick={() => setQcResult("FAIL")}
          >
            FAIL
          </Button>
        </div>
      </div>

      <textarea
        value={qcRemarks}
        onChange={(e) => setQcRemarks(e.target.value)}
        placeholder="QC remarks..."
        className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
      />
      <Button
        className="w-full sm:w-auto"
        onClick={saveQc}
        disabled={saving || qcMax <= 0}
      >
        {saving ? "Saving..." : "Save QC result"}
      </Button>
    </div>
  );
}

import { n } from "../qcUtils";
import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function TestingForm({
  detail,
  failedTotal,
  passedTotal,
  saveTesting,
  saving,
  setTestingQty,
  setTestingRemarks,
  setTestingResult,
  testingMax,
  testingQty,
  testingRemarks,
  testingResult,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">Produced</p>
          <p className="text-xl font-semibold">
            {n(detail?.production?.quantityCompleted)}
          </p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">Passed</p>
          <p className="text-xl font-semibold">{passedTotal}</p>
        </div>
        <div className="rounded-xl border p-3 text-center">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-xl font-semibold">{failedTotal}</p>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <Label htmlFor="testing-qty">Quantity to test</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="testing-qty"
            type="text"
            inputMode="numeric"
            value={testingQty}
            onChange={(e) => setTestingQty(e.target.value)}
            disabled={testingMax <= 0}
          />
          <Button
            variant="outline"
            disabled={testingMax <= 0}
            onClick={() => setTestingQty(String(testingMax))}
          >
            Max
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Maximum available: {testingMax}
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-medium">
          Overall testing result
        </p>
        <div className="flex gap-2">
          <Button
            variant={
              testingResult === "PASS" ? "default" : "outline"
            }
            onClick={() => setTestingResult("PASS")}
          >
            PASS
          </Button>
          <Button
            variant={
              testingResult === "FAIL" ? "destructive" : "outline"
            }
            onClick={() => setTestingResult("FAIL")}
          >
            FAIL
          </Button>
        </div>
      </div>

      <textarea
        value={testingRemarks}
        onChange={(e) => setTestingRemarks(e.target.value)}
        placeholder="Testing remarks..."
        className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
      />
      <Button
        className="w-full sm:w-auto"
        onClick={saveTesting}
        disabled={saving || testingMax <= 0}
      >
        {saving ? "Saving..." : "Save testing result"}
      </Button>
    </div>
  );
}

import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RedoTestingForm({
  close,
  failedTotal,
  newFailedTotal,
  newPassedTotal,
  passedTotal,
  redoPassed,
  saveRedoTesting,
  saving,
  setRedoPassed,
  testedTotal,
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Redo failed units
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          Retest the failed units
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter how many of the failed units passed after repair.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Tested</p>
          <p className="text-2xl font-semibold">{testedTotal}</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Passed</p>
          <p className="text-2xl font-semibold">{passedTotal}</p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Failed</p>
          <p className="text-2xl font-semibold">{failedTotal}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-medium">Current result</p>
        <p className="mt-1 text-lg">
          {passedTotal} out of {testedTotal} passed · {failedTotal}{" "}
          failed
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <Label htmlFor="redo-passed">New passed quantity</Label>
        <Input
          id="redo-passed"
          type="text"
          inputMode="numeric"
          value={redoPassed}
          onChange={(e) => setRedoPassed(e.target.value)}
          placeholder="0"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Maximum: {failedTotal}. This number is added to Passed and
          removed from Failed.
        </p>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-medium">New result</p>
        <p className="mt-1 text-lg font-semibold">
          {newPassedTotal} passed · {newFailedTotal} failed
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 sm:flex-none"
          onClick={saveRedoTesting}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save redo result"}
        </Button>
        <Button variant="outline" onClick={close} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/saturday/button";

export default function RedoQcForm({
  close,
  newQcApprovedTotal,
  newQcRejectedTotal,
  qcApprovedTotal,
  qcInspectedTotal,
  qcRejectedTotal,
  redoApproved,
  saveRedoQc,
  saving,
  setRedoApproved,
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Edit rejected units
        </p>
        <h3 className="mt-1 text-xl font-semibold">
          Correct the rejected units
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter how many rejected units passed after correction.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Inspected</p>
          <p className="text-2xl font-semibold">
            {qcInspectedTotal}
          </p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Approved</p>
          <p className="text-2xl font-semibold">
            {qcApprovedTotal}
          </p>
        </div>
        <div className="rounded-xl border p-4 text-center">
          <p className="text-xs text-muted-foreground">Rejected</p>
          <p className="text-2xl font-semibold">
            {qcRejectedTotal}
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-medium">Current result</p>
        <p className="mt-1 text-lg">
          {qcApprovedTotal} out of {qcInspectedTotal} approved ·{" "}
          {qcRejectedTotal} rejected
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <Label htmlFor="redo-approved">New approved quantity</Label>
        <Input
          id="redo-approved"
          type="text"
          inputMode="numeric"
          value={redoApproved}
          onChange={(e) => setRedoApproved(e.target.value)}
          placeholder="0"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Maximum: {qcRejectedTotal}. This number is added to
          Approved and removed from Rejected.
        </p>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm font-medium">New result</p>
        <p className="mt-1 text-lg font-semibold">
          {newQcApprovedTotal} approved · {newQcRejectedTotal}{" "}
          rejected
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1 sm:flex-none"
          onClick={saveRedoQc}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save edit result"}
        </Button>
        <Button variant="outline" onClick={close} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

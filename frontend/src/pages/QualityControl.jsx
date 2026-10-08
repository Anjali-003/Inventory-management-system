import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Factory,
  FlaskConical,
  RefreshCw,
  X,
} from "lucide-react";
import api from "../api/api";
import PageHeader from "../components/PageHeader";
import SearchBar from "../components/SearchBar";
import StatStrip from "../components/StatStrip";
import {
  EmptyState,
  Notice,
  OrderStatus,
  TableSkeleton,
} from "../components/feedback";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input, Label } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useToast } from "../components/toast";

const n = (v) => Number(v || 0);
const whole = (v) =>
  /^\d+$/.test(String(v ?? "").trim()) &&
  Number.isSafeInteger(Number(v)) &&
  Number(v) > 0;

function Status({ item }) {
  return <OrderStatus status={item.status} />;
}

function ProductionCard({ item, onOpen }) {
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

export default function QualityControl() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [stage, setStage] = useState("TESTING");
  const [testingQty, setTestingQty] = useState("1");
  const [qcQty, setQcQty] = useState("1");
  const [testingResult, setTestingResult] = useState("");
  const [qcResult, setQcResult] = useState("");
  const [testingRemarks, setTestingRemarks] = useState("");
  const [qcRemarks, setQcRemarks] = useState("");
  const [redoPassed, setRedoPassed] = useState("");
  const [redoApproved, setRedoApproved] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/quality-control");
      setItems(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || "Failed to load quality control.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (x) =>
        !q ||
        `${x.orderNumber} ${x.productName} ${x.productSku}`
          .toLowerCase()
          .includes(q),
    );
  }, [items, query]);

  const totals = useMemo(
    () => ({
      orders: items.length,
      produced: items.reduce((a, x) => a + n(x.quantityCompleted), 0),
      readyTesting: items.reduce((a, x) => a + n(x.remainingToTest), 0),
      readyQc: items.reduce((a, x) => a + n(x.availableForQC), 0),
    }),
    [items],
  );

  const reset = () => {
    setDetail(null);
    setSelected(null);
    setStage("TESTING");
    setTestingQty("1");
    setQcQty("1");
    setTestingResult("");
    setQcResult("");
    setTestingRemarks("");
    setQcRemarks("");
    setRedoPassed("");
    setRedoApproved("");
  };

  const open = async (item, nextStage) => {
    setSelected(item);
    setStage(nextStage);
    setError("");

    try {
      const { data } = await api.get(`/quality-control/${item.id}`);
      setDetail(data);
      setTestingResult(data.latestTesting?.overall_result || "");
      setQcResult(data.latestQualityControl?.overall_result || "");
      setTestingQty("1");
      setQcQty("1");
      setRedoPassed("");
      setRedoApproved("");
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || "Failed to load inspection details.",
      );
    }
  };

  const close = () => reset();
  const testingMax = n(detail?.testing?.remainingToTest);
  const qcMax = n(detail?.qualityControl?.availableForQC);
  const testedTotal = n(detail?.testing?.quantityTested);
  const passedTotal = n(detail?.testing?.quantityPassed);
  const failedTotal = n(detail?.testing?.quantityFailed);
  const qcInspectedTotal = n(detail?.qualityControl?.quantityInspected);
  const qcApprovedTotal = n(detail?.qualityControl?.quantityApproved);
  const qcRejectedTotal = n(detail?.qualityControl?.quantityRejected);
  const orderedTotal = n(detail?.production?.orderedQuantity);
  const redoPassedNumber = Number(redoPassed || 0);
  const newPassedTotal = passedTotal + redoPassedNumber;
  const newFailedTotal = Math.max(0, failedTotal - redoPassedNumber);
  const redoApprovedNumber = Number(redoApproved || 0);
  const newQcApprovedTotal = qcApprovedTotal + redoApprovedNumber;
  const newQcRejectedTotal = Math.max(0, qcRejectedTotal - redoApprovedNumber);

  const saveTesting = async () => {
    if (!whole(testingQty))
      return setError("Testing quantity must be a positive whole number.");

    const quantity = Number(testingQty);

    if (quantity > testingMax)
      return setError(`You can test at most ${testingMax} unit(s).`);
    if (!testingResult) return setError("Select PASS or FAIL.");

    try {
      setSaving(true);
      setError("");

      await api.post(`/quality-control/${selected.id}/testing`, {
        quantity,
        overallResult: testingResult,
        remarks: testingRemarks,
      });

      close();
      toast.success("Testing result saved");
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to save testing result.");
    } finally {
      setSaving(false);
    }
  };

  const saveRedoTesting = async () => {
    if (!/^\d+$/.test(redoPassed.trim())) {
      return setError("Enter how many failed units passed after repair.");
    }

    const passedAfterRedo = Number(redoPassed);

    if (passedAfterRedo > failedTotal) {
      return setError(`You can pass at most ${failedTotal} failed unit(s).`);
    }

    try {
      setSaving(true);
      setError("");

      await api.patch(`/quality-control/${selected.id}/testing/redo`, {
        redoPassed: passedAfterRedo,
      });

      const allFixed = failedTotal - passedAfterRedo === 0;
      close();
      toast.success(
        allFixed
          ? "All failed units fixed. Testing now passes."
          : "Redo testing result saved.",
      );
      await load();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.message || "Failed to save redo testing result.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveRedoQc = async () => {
    if (!/^\d+$/.test(redoApproved.trim())) {
      return setError("Enter how many rejected units passed after correction.");
    }

    const approvedAfterRedo = Number(redoApproved);

    if (approvedAfterRedo > qcRejectedTotal) {
      return setError(
        `You can approve at most ${qcRejectedTotal} rejected unit(s).`,
      );
    }

    try {
      setSaving(true);
      setError("");

      const { data } = await api.patch(
        `/quality-control/${selected.id}/qc/redo`,
        { redoApproved: approvedAfterRedo },
      );

      close();
      toast.success(
        data?.readyForFinishedGoods
          ? "All QC completed. Finished Goods is ready."
          : approvedAfterRedo === qcRejectedTotal
            ? "All rejected units fixed. QC now passes."
            : "QC edit result saved.",
      );
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to save QC edit result.");
    } finally {
      setSaving(false);
    }
  };

  const saveQc = async () => {
    if (!whole(qcQty))
      return setError("QC quantity must be a positive whole number.");

    const quantity = Number(qcQty);

    if (quantity > qcMax)
      return setError(`You can inspect at most ${qcMax} unit(s).`);
    if (!qcResult) return setError("Select PASS or FAIL.");

    try {
      setSaving(true);
      setError("");

      const { data } = await api.post(`/quality-control/${selected.id}/qc`, {
        quantity,
        overallResult: qcResult,
        remarks: qcRemarks,
      });

      close();
      toast.success(
        data?.readyForFinishedGoods
          ? "QC complete and Finished Goods is ready"
          : "QC result saved",
      );
      await load();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to save QC result.");
    } finally {
      setSaving(false);
    }
  };

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

        {loading ? (
          <TableSkeleton rows={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Factory}
            title={
              query
                ? "No matching production runs"
                : "Nothing ready for inspection"
            }
          >
            Completed production quantities will appear here.
          </EmptyState>
        ) : (
          <>
            <div className="hidden w-full overflow-hidden md:block">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[16%]">Order</TableHead>
                    <TableHead className="w-[15%]">Product</TableHead>
                    <TableHead className="w-[8%]">Produced</TableHead>
                    <TableHead className="w-[18%]">Testing</TableHead>
                    <TableHead className="w-[18%]">QC</TableHead>
                    <TableHead className="w-[10%]">Status</TableHead>
                    <TableHead className="w-[15%] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const testing = n(item.remainingToTest);
                    const failed = n(item.quantityFailed);
                    const qc = n(item.availableForQC);
                    const rejected = n(item.quantityRejected);
                    const readyForFinishedGoods = !!item.readyForFinishedGoods;

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-0 whitespace-normal break-words font-medium tabular-nums">
                          {item.orderNumber}
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal break-words">
                          <span className="block break-words font-medium">
                            {item.productName}
                          </span>
                          <span className="block break-words text-xs text-muted-foreground">
                            {item.productSku}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {n(item.quantityCompleted)}
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal break-words">
                          <p className="break-words">
                            Tested {n(item.quantityTested)}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            Passed {n(item.quantityPassed)} · Failed {failed} ·
                            Left {testing}
                          </p>
                        </TableCell>
                        <TableCell className="min-w-0 whitespace-normal break-words">
                          <p className="break-words">
                            Inspected {n(item.quantityInspected)}
                          </p>
                          <p className="break-words text-xs text-muted-foreground">
                            Approved {n(item.quantityApproved)} · Ready {qc}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Status item={item} />
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="flex flex-wrap justify-end gap-2">
                            {(testing > 0 || failed > 0) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => open(item, "TESTING")}
                              >
                                Testing
                              </Button>
                            )}
                            {failed > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => open(item, "REDO_TESTING")}
                              >
                                Edit Testing
                              </Button>
                            )}
                            {testing <= 0 && failed === 0 && qc > 0 && (
                              <Button
                                size="sm"
                                onClick={() => open(item, "QUALITY_CONTROL")}
                              >
                                Quality Control
                              </Button>
                            )}
                            {testing <= 0 && failed === 0 && rejected > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => open(item, "REDO_QC")}
                              >
                                Edit QC
                              </Button>
                            )}
                            {readyForFinishedGoods && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  (window.location.href = "/finished-goods")
                                }
                              >
                                Open Finished Goods
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 p-3 md:hidden">
              {rows.map((item) => (
                <ProductionCard key={item.id} item={item} onOpen={open} />
              ))}
            </div>
          </>
        )}
      </Card>

      {selected && (
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
              )}

              {stage === "REDO_TESTING" && (
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
              )}

              {stage === "REDO_QC" && (
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
              )}

              {stage === "QUALITY_CONTROL" && (
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

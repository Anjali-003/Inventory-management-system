import { useToast } from "@/components/toast";
import { useState, useCallback, useMemo } from "react";
import { qualityControlService } from "@/features/quality-control/qualityControlService";
import { useGetQualityControlQuery } from "@/features/quality-control/qualityControlApi";
import { errorMessage } from "@/lib/stock";
import { n, whole } from "../qcUtils";

export default function useQualityControl() {
  const toast = useToast();
  // the queue is cached by RTK Query and refetched live (see realtime/LiveSync.jsx)
  const { data: items = [], isLoading: loading, error: loadError, refetch } = useGetQualityControlQuery();
  const [actionError, setError] = useState("");
  const error = actionError || (loadError ? errorMessage(loadError, "Failed to load quality control.") : "");
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
    setError("");
    await refetch();
  }, [refetch]);

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
      const { data } = await qualityControlService.getOne(item.id);
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

      await qualityControlService.saveTesting(selected.id, {
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

      await qualityControlService.redoTesting(selected.id, {
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

      const { data } = await qualityControlService.redoQc(selected.id, { redoApproved: approvedAfterRedo });

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

      const { data } = await qualityControlService.saveQc(selected.id, {
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

  return {
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
  };
}

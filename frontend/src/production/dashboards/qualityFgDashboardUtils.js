const number = (value) => Math.max(0, Number(value) || 0)

/* Finished batches (every ordered unit made) with no QC decision yet. */
export function getQcPendingBatches(items = []) {
  return items.filter((item) => !item.batchDecision && number(item.quantityCompleted) >= number(item.orderedQuantity) && number(item.orderedQuantity) > 0)
}

/* Batches QC failed that are back with Production (not yet sent back for a retest). */
export function getQcFailedBatches(items = []) {
  return items.filter((item) => item.latestDecision === "FAIL" && item.reworkStatus !== "READY_FOR_QC")
}

/* Failed batches Production has fixed and sent back for another QC decision. */
export function getQcReadyForRetest(items = []) {
  return items.filter((item) => item.reworkStatus === "READY_FOR_QC" && !item.batchDecision)
}

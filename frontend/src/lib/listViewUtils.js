export function recordTimestamp(value) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function isWithinDateRange(value, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  if (!value) return false
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return false
  const date = new Date(timestamp)
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  return (!fromDate || day >= fromDate) && (!toDate || day <= toDate)
}

export function uniqueStringOptions(items, getter, allLabel = "All products") {
  const values = [...new Set(items.map(getter).filter((value) => typeof value === "string" && value.trim()))]
    .sort((a, b) => a.localeCompare(b))
  return [{ value: "all", label: allLabel }, ...values.map((value) => ({ value, label: value }))]
}

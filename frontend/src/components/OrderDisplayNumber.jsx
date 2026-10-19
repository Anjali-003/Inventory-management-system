const toLetterSuffix = (value) => {
  let number = Math.max(1, Number(value) || 1)
  let suffix = ""
  while (number > 0) {
    number -= 1
    suffix = String.fromCharCode(65 + (number % 26)) + suffix
    number = Math.floor(number / 26)
  }
  return suffix
}

export default function OrderDisplayNumber({ orderNumber, itemCount, itemIndex, fallback, className = "" }) {
  const showSuffix = Number(itemCount) > 1
  const suffix = showSuffix ? toLetterSuffix(itemIndex) : ""
  const base = orderNumber || fallback || "Order unavailable"

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      <span className="break-words">{base}</span>
      {suffix && (
        <span className="inline-flex shrink-0 items-center rounded-md bg-teal-50 px-1.5 py-0.5 text-[1.05em] font-extrabold tracking-wide text-teal-800 ring-1 ring-inset ring-teal-200">
          -{suffix}
        </span>
      )}
    </span>
  )
}

/*
  The order number as every page shows it. When the order holds several products, each product is its own line
  (Production builds them one by one), so the line also says which one it is: "ORD-...-005 · Product 2 of 3".
  The order number itself stays exactly as Marketing, Store and Finished Goods show it.
*/
export default function OrderDisplayNumber({ orderNumber, itemCount, itemIndex, fallback, className = "" }) {
  const count = Number(itemCount) || 0
  const index = Math.min(Math.max(1, Number(itemIndex) || 1), Math.max(count, 1))
  const base = orderNumber || fallback || "Order unavailable"

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      <span className="break-words">{base}</span>
      {count > 1 && (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md bg-teal-50 px-1.5 py-0.5 text-[0.8em] font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">
          Product {index} of {count}
        </span>
      )}
    </span>
  )
}

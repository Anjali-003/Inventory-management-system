import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { TriangleAlert } from "lucide-react"
import { Modal } from "@/components/Modal"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { usePermissions } from "@/features/auth/usePermissions"

/*
  An order whose products have an incomplete component list (BOM) cannot be planned until every component has a
  quantity. <BomBlockModal> is the popup that opens FIRST when such an order is opened (the order popup and the
  "Check stock & send" popup both check for it): it only has Close, so the admin cannot go on to approve, send or
  reject from there. <BomWarning> is the amber box inside it. `items` are the order's product lines.
*/
export default function BomWarning({ plan, items = [] }) {
  const { canView } = usePermissions()
  const ids = plan?.missing_bom
  if (!ids?.length) return null

  const names = Object.fromEntries(items.map((i) => [i.product_id, i]))

  return (
    <div role="alert" className="flex gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Some products have an incomplete component list (BOM)</p>
        <ul className="mt-1 space-y-1">
          {ids.map((id) => {
            const blank = plan.incomplete_bom?.find((b) => b.product_id === id)
            return (
              <li key={id}>
                <span className="font-semibold">{names[id]?.name || `#${id}`}</span>
                {": "}
                {blank
                  ? `the quantity is blank for ${blank.components.map((c) => c.name || c.sku).join(", ")}`
                  : "no components have been added yet"}
              </li>
            )
          })}
        </ul>
        <p className="mt-2">
          It cannot be planned until every component has a quantity. Fix it on the{" "}
          {canView("products") ? <Link to="/products" className="font-semibold underline">Products page</Link> : "Products page"}, then open this order again.
        </p>
      </div>
    </div>
  )
}

/* The blocking popup: the warning and a Close button, nothing else. */
export function BomBlockModal({ order, plan, onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={order.order_number}
      className="border-2 border-amber-400"
      footer={<MktBtn onClick={onClose} data-autofocus>Close</MktBtn>}
    >
      <div className="space-y-4">
        {/* the big banner: readable from across the room, same family as the status banners in the order popup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 p-5 text-white shadow-lg shadow-orange-600/30"
        >
          <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
          <div className="relative flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/40 motion-safe:animate-pulse">
              <TriangleAlert className="size-8" strokeWidth={2.2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold leading-tight tracking-[-0.02em]">BOM incomplete</p>
              <p className="mt-1 text-sm font-medium text-white/90">This order cannot go ahead yet.</p>
            </div>
          </div>
        </motion.div>

        <BomWarning plan={plan} items={order.items} />
        <p className="text-sm font-medium text-foreground/80">Stock check, approve and reject are blocked until every component has a quantity.</p>
      </div>
    </Modal>
  )
}

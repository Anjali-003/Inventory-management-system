import { motion } from "motion/react"
import { Factory, Loader2, ShoppingCart } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { MktBtn } from "@/sales/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/sales/marketing-orders/mktMotion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, fmtQty } from "@/lib/stock"
import { useIdempotentSubmit } from "@/lib/useIdempotentSubmit"
import { cn } from "@/lib/utils"
import { planTotals } from "./approvalParts"
import { BomBlockModal } from "./BomWarning"
import { useGetOrderPlanQuery, useSendToProductionMutation, useSendToPurchaseMutation } from "./orderApprovalsApi"

/*
  Operations Admin, on an APPROVED order: send ONE list, checked against the stock that is available right now.
    mode "production"  what the stock can build now of the units not in Production yet. Their stock is deducted when
                       sent. Again whenever more parts come in.
    mode "purchase"    the components that are short for those units, to the Purchase Manager. Once per order.
  The backend works the list out again when sending; if the stock changed in between it answers 409 STALE_PLAN and
  the fresh stock check is shown.
*/
const MODES = {
  production: {
    icon: Factory, grad: "from-violet-600 to-indigo-800", glow: "shadow-indigo-500/30",
    title: (o) => `Send ${o.order_number} to Production`,
    description: "What the stock can build now goes to the Production Manager, and the stock for it is deducted now. Send again when more parts come in.",
  },
  purchase: {
    icon: ShoppingCart, grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30",
    title: (o) => `Send the list of ${o.order_number} to Purchase`,
    description: "The components that are short go to the Purchase Manager to buy. This list is sent once for the order.",
  },
}

export default function OrderPlanModal({ order, mode = "production", onClose }) {
  const toast = useToast()
  const { data: plan, isLoading, isFetching, error, refetch } = useGetOrderPlanQuery(order.id)
  const [sendProduction, { isLoading: sendingProduction }] = useSendToProductionMutation()
  const [sendPurchase, { isLoading: sendingPurchase }] = useSendToPurchaseMutation()
  const guarded = useIdempotentSubmit()
  const sending = sendingProduction || sendingPurchase
  const m = MODES[mode]

  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i]))
  const lines = plan?.lines || []
  const shortages = plan?.shortages || []
  const toBuild = lines.filter((l) => Number(l.can_make) > 0)
  const { ordered, canMake } = planTotals(plan)

  const blocked = !plan
    ? null
    : mode === "production"
      ? canMake === 0 ? "Nothing can be built from the current stock yet. Wait until the parts are in." : null
      : plan.purchase_sent ? "The component list of this order was already sent to Purchase."
        : shortages.length === 0 ? "Nothing is short: every component is in stock." : null

  const submit = async (e) => {
    e.preventDefault()
    if (blocked) return
    try {
      if (mode === "production") {
        const done = await guarded((key) => sendProduction({
          id: order.id,
          idempotency_key: key,
          expected_round: Number(plan?.approval_round ?? order.approval_round) || 0,
          production_items: toBuild.map((l) => ({ product_id: l.product_id, quantity: Number(l.can_make) })),
        }).unwrap())
        if (done === undefined) return // a request is already in flight
        toast.success(`${order.order_number}: ${fmtQty(canMake)} units sent to Production. Their stock was deducted.`)
      } else {
        await sendPurchase({ id: order.id, purchase_items: shortages.map((s) => ({ component_id: s.component_id, quantity: s.shortage })) }).unwrap()
        toast.success(`${order.order_number}: ${shortages.length} components sent to the Purchase Manager.`)
      }
      onClose()
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the list."))
      if (err?.response?.data?.code === "STALE_PLAN") refetch()
    }
  }

  // An order with an incomplete BOM gets the blocking warning popup instead.
  if (plan?.missing_bom?.length > 0) return <BomBlockModal order={order} plan={plan} onClose={onClose} />

  const Icon = m.icon
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={sending}
      size="xl"
      title={m.title(order)}
      description={m.description}
      footer={
        <>
          <MktBtn onClick={onClose} disabled={sending} className="sm:me-auto">Close</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={sending || isLoading || isFetching || !plan || !!blocked}>
            {sending && <Loader2 className="animate-spin" />}
            {mode === "production"
              ? canMake > 0 ? `Send ${fmtQty(canMake)} units to Production` : "Nothing can be built yet"
              : `Send ${shortages.length} components to Purchase`}
          </MktBtn>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Notice title="Could not check stock">The stock check failed. Close this window and try again.</Notice>}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking stock...
          </div>
        )}

        {plan && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
              className={cn("relative overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-lg", m.grad, m.glow)}
            >
              <div className="relative flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">
                    {mode === "production"
                      ? `${fmtQty(canMake)} of ${fmtQty(ordered)} units can be built now`
                      : `${shortages.length} components to buy`}
                  </p>
                  <p className="mt-0.5 text-xs text-white/95">
                    {mode === "production"
                      ? `${fmtQty(ordered)} units of this order are not sent to Production yet.`
                      : `For the ${fmtQty(ordered)} units not sent to Production yet, minus what is in stock.`}
                  </p>
                </div>
              </div>
            </motion.div>

            {blocked && <Notice title="Nothing to send">{blocked}</Notice>}

            {mode === "production" ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-end">Not sent to Production yet</TableHead>
                      <TableHead className="text-end">Can build now (sent)</TableHead>
                      <TableHead className="text-end">Still waiting for components</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.product_id}>
                        <TableCell>
                          <p className="font-medium">{names[l.product_id]?.name || `#${l.product_id}`}</p>
                          {names[l.product_id]?.sku && <p className="text-xs text-muted-foreground">{names[l.product_id].sku}</p>}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{fmtQty(l.ordered)}</TableCell>
                        <TableCell className={cn("text-end font-semibold tabular-nums", l.can_make > 0 ? "text-success" : "text-muted-foreground")}>{fmtQty(l.can_make)}</TableCell>
                        <TableCell className={cn("text-end tabular-nums", Number(l.remaining) > 0 && "font-semibold text-destructive")}>{fmtQty(l.remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : shortages.length > 0 && (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      <TableHead className="text-end">Required</TableHead>
                      <TableHead className="text-end">In stock</TableHead>
                      <TableHead className="text-end">To buy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortages.map((s) => (
                      <TableRow key={s.component_id}>
                        <TableCell>
                          <p className="font-medium">{s.name}</p>
                          {s.sku && <p className="text-xs text-muted-foreground">{s.sku}</p>}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{fmtQty(s.required)} {s.unit}</TableCell>
                        <TableCell className="text-end tabular-nums">{fmtQty(s.available)} {s.unit}</TableCell>
                        <TableCell className="text-end font-semibold tabular-nums text-destructive">{fmtQty(s.shortage)} {s.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

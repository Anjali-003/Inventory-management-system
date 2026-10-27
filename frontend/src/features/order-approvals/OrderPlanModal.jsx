import { useState } from "react"
import { motion } from "motion/react"
import { Loader2, Factory, ShoppingCart } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Accordion } from "@/components/ui/accordion"
import { Notice } from "@/components/feedback"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, fmtQty } from "@/lib/stock"
import { useIdempotentSubmit } from "@/lib/useIdempotentSubmit"
import { cn } from "@/lib/utils"
import { isRest, planTotals, planVerdict } from "./approvalParts"
import { BomBlockModal } from "./BomWarning"
import { DecisionButtons } from "./DecisionButtons"
import { useDispatchOrderMutation, useGetOrderPlanQuery } from "./orderApprovalsApi"

/* Banner colours by plan verdict: the same stage colours the Marketing Manager sees (emerald / amber / rose / slate). */
const BANNER = {
  success: { grad: "from-emerald-700 to-emerald-800", glow: "shadow-emerald-600/30" },
  warning: { grad: "from-amber-700 to-orange-800", glow: "shadow-orange-500/30" },
  danger: { grad: "from-rose-600 to-red-800", glow: "shadow-red-500/30" },
  neutral: { grad: "from-slate-600 to-slate-800", glow: "shadow-slate-500/30" },
}

/* A titled block of the stock check. Folded by default: the admin has just seen these lists on the Stock check tab,
   the title already says the count, and the list opens with one click when needed. */
function Section({ icon: Icon, title, hint, children }) {
  return (
    <Accordion
      as="section"
      headerClassName="rounded-lg"
      panelClassName="pt-2"
      header={
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
      }
    >
      {children}
    </Accordion>
  )
}

/*
  Operations Admin: one order, planned against the stock that is available right now.
    - what can be built now  -> list for the Production Manager
    - components still short -> list for the Purchase Manager
  "Approve & send lists" approves the order and sends both lists in one step. The backend checks the plan
  again at that moment; if stock changed in between it answers 409 STALE_PLAN and the new plan is shown.
  The other two decisions (Reject, Revise quantity) are in the footer too, so the admin never has to go back.
*/
export default function OrderPlanModal({ order, onClose, onSwitch }) {
  const toast = useToast()
  const { data: plan, isLoading, isFetching, error, refetch } = useGetOrderPlanQuery(order.id)
  const [dispatch, { isLoading: sending }] = useDispatchOrderMutation()
  const guarded = useIdempotentSubmit()
  const [remarks, setRemarks] = useState("")
  const [serverError, setServerError] = useState("")

  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i]))
  const lines = plan?.lines || []
  // approving the rest: Production only, the purchase list went out with the first approval
  const rest = isRest(order)
  const shortages = rest ? [] : plan?.shortages || []

  // No partial approval: the order is approved as a whole. What the stock covers now goes to production (not editable).
  const toProduction = lines
    .filter((line) => Number(line.can_make) > 0)
    .map((line) => ({ ...line, approved_quantity: Number(line.can_make) }))
  const { ordered, canMake } = planTotals(plan)
  const selectedTotal = toProduction.reduce((sum, line) => sum + line.approved_quantity, 0)
  const verdict = plan ? planVerdict(plan) : null
  const nothingToSend = rest ? selectedTotal === 0 : selectedTotal === 0 && shortages.length === 0

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    try {
      const done = await guarded((key) => dispatch({
        id: order.id,
        idempotency_key: key,
        expected_round: Number(plan?.approval_round ?? order.approval_round) || 0,
        remarks: remarks.trim(),
        production_items: toProduction.map((l) => ({ product_id: l.product_id, quantity: l.approved_quantity })),
        purchase_items: shortages.map((s) => ({ component_id: s.component_id, quantity: s.shortage })),
      }).unwrap())
      if (done === undefined) return // a request is already in flight
      const parts = []
      if (toProduction.length) parts.push("Production Manager")
      if (shortages.length) parts.push("Purchase Manager")
      toast.success(
        rest
          ? `${order.order_number}: ${selectedTotal} more units sent to Production.`
          : parts.length
            ? `${order.order_number} approved. Sent to ${parts.join(" and ")}${selectedTotal ? `; BOM for ${selectedTotal} units issued to inventory` : ""}.`
            : `${order.order_number} approved.`
      )
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not send this order."))
      if (err?.response?.data?.code === "STALE_PLAN") refetch()
    }
  }

  // An order with an incomplete BOM gets the blocking warning popup instead of the plan.
  if (plan?.missing_bom?.length > 0) return <BomBlockModal order={order} plan={plan} onClose={onClose} />

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={sending}
      size="xl"
      title={rest ? `Approve the rest of ${order.order_number}` : `Send ${order.order_number} on`}
      description={rest
        ? "Parts have come in. What the stock can build now of the units not approved yet goes to Production, and its stock is deducted."
        : "Approving sends what the stock can build to Production and the components to buy to Purchase, in one step. Open a list below to check it."}
      footer={
        <>
          <MktBtn onClick={onClose} disabled={sending} className="sm:me-auto">Close</MktBtn>
          {onSwitch && <DecisionButtons order={order} plan={plan} current="plan" disabled={sending} onDecide={onSwitch} />}
          <MktBtn type="submit" variant="primary" disabled={sending || isLoading || isFetching || !plan || nothingToSend}>
            {sending && <Loader2 className="animate-spin" />}
            {rest ? (nothingToSend ? "Nothing can be made yet" : `Send ${fmtQty(selectedTotal)} more to Production`) : "Approve order & send lists"}
          </MktBtn>
        </>
      }
    >
      <div className="space-y-5">
        {serverError && <Notice title="Could not send">{serverError}</Notice>}
        {error && <Notice title="Could not check stock">The stock check failed. Close this window and try again.</Notice>}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking stock...
          </div>
        )}

        {plan && (
          <>
            <motion.div
              key={verdict.label}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1, transition: SPRING_SOFT }}
              className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg", BANNER[verdict.variant]?.grad, BANNER[verdict.variant]?.glow)}
            >
              <span aria-hidden className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
              <div className="relative flex items-center gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
                  <Factory className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{verdict.label}</p>
                  <p className="mt-0.5 text-xs text-white/95">
                    {`${fmtQty(Math.max(0, ordered - canMake))} units short on stock`}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(ordered)}</p>
                  <p className="mt-1 text-[11px] text-white/95">{rest ? "still to approve" : "ordered"} · {fmtQty(canMake)} can be made now</p>
                </div>
              </div>
            </motion.div>

            <Section icon={Factory} title={`To Production: ${fmtQty(canMake)} of ${fmtQty(ordered)} units`} hint="Per product: units ordered, units the stock can build now (sent to the Production Manager) and units short.">
              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-end">Ordered</TableHead>
                      <TableHead className="text-end">Can make now</TableHead>
                      <TableHead className="text-end">Short</TableHead>
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
                        <TableCell className={cn("text-end font-semibold tabular-nums", l.can_make > 0 ? "text-success" : "text-destructive")}>{fmtQty(l.can_make)}</TableCell>
                        <TableCell className={cn("text-end tabular-nums", Number(l.remaining) > 0 && "font-semibold text-destructive")}>{fmtQty(l.remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            {!rest && <Section
              icon={ShoppingCart}
              title={shortages.length ? `To Purchase: ${shortages.length} component${shortages.length === 1 ? "" : "s"} to buy` : "To Purchase: nothing to buy"}
              hint="Required for the whole order, minus what is in stock."
            >
              {shortages.length === 0 ? (
                <p className="rounded-xl border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                  {plan.missing_bom?.length ? "No shortage can be worked out until the BOM is completed." : "Nothing to buy: every component is in stock."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border">
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
            </Section>}

            {!rest && <Field label="Remarks (optional)" htmlFor="plan-remarks">
              <textarea
                id="plan-remarks"
                rows={2}
                maxLength={500}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Anything the Production or Purchase Manager should know"
                className="w-full rounded-[10px] border border-cf-line-strong bg-card px-3 py-2 text-base outline-none sm:text-[13px] transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
              />
            </Field>}
          </>
        )}
      </div>
    </Modal>
  )
}

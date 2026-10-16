import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Loader2, Factory, ShoppingCart } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { SPRING_SOFT } from "@/features/marketing-orders/mktMotion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { planTotals, planVerdict } from "./approvalParts"
import { BomBlockModal } from "./BomWarning"
import { useDispatchOrderMutation, useGetOrderPlanQuery } from "./orderApprovalsApi"

/* Banner colours by plan verdict: the same stage colours the Marketing Manager sees (emerald / amber / rose / slate). */
const BANNER = {
  success: { grad: "from-emerald-400 to-emerald-700", glow: "shadow-emerald-600/30" },
  warning: { grad: "from-amber-400 to-orange-500", glow: "shadow-orange-500/30" },
  danger: { grad: "from-rose-400 to-red-600", glow: "shadow-red-500/30" },
  neutral: { grad: "from-slate-400 to-slate-600", glow: "shadow-slate-500/30" },
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

/*
  Operations Admin: one order, planned against the stock that is available right now.
    - what can be built now  -> list for the Production Manager
    - components still short -> list for the Purchase Manager
  "Approve & send lists" approves the order and sends both lists in one step. The backend checks the plan
  again at that moment; if stock changed in between it answers 409 STALE_PLAN and the new plan is shown.
*/
export default function OrderPlanModal({ order, onClose }) {
  const toast = useToast()
  const { data: plan, isLoading, isFetching, error, refetch } = useGetOrderPlanQuery(order.id)
  const [dispatch, { isLoading: sending }] = useDispatchOrderMutation()
  const [remarks, setRemarks] = useState("")
  const [serverError, setServerError] = useState("")
  const [productionQuantities, setProductionQuantities] = useState({})

  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i]))
  const lines = plan?.lines || []
  const shortages = plan?.shortages || []
  useEffect(() => {
    if (!plan) return
    setProductionQuantities(Object.fromEntries(plan.lines.map((line) => [
      line.product_id,
      String(Math.floor(Number(line.can_make))),
    ])))
  }, [plan])

  const quantityFor = (line) => Number(productionQuantities[line.product_id] ?? 0)
  const toProduction = lines
    .filter((line) => quantityFor(line) > 0)
    .map((line) => ({ ...line, approved_quantity: quantityFor(line) }))
  const { ordered, canMake } = planTotals(plan)
  const selectedTotal = toProduction.reduce((sum, line) => sum + line.approved_quantity, 0)
  const verdict = plan ? planVerdict(plan) : null
  const nothingToSend = selectedTotal === 0 && shortages.length === 0

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    try {
      await dispatch({
        id: order.id,
        remarks: remarks.trim(),
        production_items: toProduction.map((l) => ({ product_id: l.product_id, quantity: l.approved_quantity })),
        purchase_items: shortages.map((s) => ({ component_id: s.component_id, quantity: s.shortage })),
      }).unwrap()
      const parts = []
      if (toProduction.length) parts.push("Production Manager")
      if (shortages.length) parts.push("Purchase Manager")
      toast.success(`${order.order_number} approved. ${selectedTotal} product units selected; corresponding BOM issued to inventory. Sent to ${parts.join(" and ")}.`)
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
      title={`${order.order_number} · stock check`}
      description="Choose how many units of each product to start now. Only the selected quantity's BOM will be issued from inventory."
      footer={
        <>
          <MktBtn onClick={onClose} disabled={sending}>Close</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={sending || isLoading || isFetching || !plan || nothingToSend}>
            {sending && <Loader2 className="animate-spin" />}
            Approve &amp; send lists
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
                  <p className="mt-0.5 text-xs text-white/80">
                    {`${fmtQty(Math.max(0, ordered - selectedTotal))} ordered units not selected for production now`}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-[26px] font-bold leading-none tracking-[-0.04em] tabular-nums">{fmtQty(selectedTotal)}</p>
                  <p className="mt-1 text-[11px] text-white/80">selected · up to {fmtQty(canMake)} possible</p>
                </div>
              </div>
            </motion.div>

            <Section icon={Factory} title="Select quantity to make now" hint="Choose up to the stock-covered maximum for each product. Inventory issues only the selected quantities' BOM.">
              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-end">Ordered</TableHead>
                      <TableHead className="text-end">Available now</TableHead>
                      <TableHead className="text-end">Make now</TableHead>
                      <TableHead className="text-end">Not selected</TableHead>
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
                        <TableCell className={cn("text-end font-semibold tabular-nums", l.can_make > 0 ? "text-primary" : "text-destructive")}>{fmtQty(l.can_make)}</TableCell>
                        <TableCell className="text-end">
                          <input
                            aria-label={`Quantity of ${l.name} to make now`}
                            className="h-9 w-24 rounded-md border bg-background px-2 text-end tabular-nums"
                            type="number"
                            min="0"
                            max={Math.floor(Number(l.can_make))}
                            step="1"
                            value={productionQuantities[l.product_id] ?? "0"}
                            disabled={sending || Number(l.can_make) < 1}
                            onChange={(event) => setProductionQuantities((current) => ({
                              ...current,
                              [l.product_id]: event.target.value,
                            }))}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">max {fmtQty(Math.floor(Number(l.can_make)))}</p>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{fmtQty(Math.max(0, Number(l.ordered) - quantityFor(l)))}</TableCell>
                        <TableCell className="text-end tabular-nums">{fmtQty(l.remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Section icon={ShoppingCart} title="Components short: goes to the Purchase Manager" hint="Estimated shortage for the order after current free stock; inventory issue is calculated from your production selection.">
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
                        <TableHead className="text-end">Needed</TableHead>
                        <TableHead className="text-end">Free stock</TableHead>
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
            </Section>

            <Field label="Remarks (optional)" htmlFor="plan-remarks">
              <textarea
                id="plan-remarks"
                rows={2}
                maxLength={500}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Anything the Production or Purchase Manager should know"
                className="w-full rounded-[10px] border border-cf-line-strong bg-card px-3 py-2 text-base outline-none sm:text-[13px] transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}

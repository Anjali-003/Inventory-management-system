import { useState } from "react"
import { Loader2, Factory, ShoppingCart } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { planTotals, planVerdict } from "./approvalParts"
import { BomBlockModal } from "./BomWarning"
import { useDispatchOrderMutation, useGetOrderPlanQuery } from "./orderApprovalsApi"

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

  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i]))
  const lines = plan?.lines || []
  const shortages = plan?.shortages || []
  const toProduction = lines.filter((l) => Number(l.can_make) > 0)
  const { ordered, canMake, remaining } = planTotals(plan)
  const verdict = plan ? planVerdict(plan) : null
  const nothingToSend = toProduction.length === 0 && shortages.length === 0

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    try {
      await dispatch({
        id: order.id,
        remarks: remarks.trim(),
        production_items: toProduction.map((l) => ({ product_id: l.product_id, quantity: l.can_make })),
        purchase_items: shortages.map((s) => ({ component_id: s.component_id, quantity: s.shortage })),
      }).unwrap()
      const parts = []
      if (toProduction.length) parts.push("Production Manager")
      if (shortages.length) parts.push("Purchase Manager")
      toast.success(`${order.order_number} approved. Sent to ${parts.join(" and ")}.`)
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
      description="Checked against the stock available right now (on hand minus what is reserved for production)."
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Can be made right now</p>
                <p className="text-lg font-semibold tabular-nums">
                  {fmtQty(canMake)} <span className="text-sm font-normal text-muted-foreground">of {fmtQty(ordered)} units</span>
                </p>
              </div>
              {remaining > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Waiting for components</p>
                  <p className="text-lg font-semibold tabular-nums">{fmtQty(remaining)} units</p>
                </div>
              )}
              <Badge variant={verdict.variant}>{verdict.label}</Badge>
            </div>

            <Section icon={Factory} title="Can be made now: goes to the Production Manager" hint="Quantities that the current stock fully covers.">
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Can make now</TableHead>
                      <TableHead className="text-right">Still short</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.product_id}>
                        <TableCell>
                          <p className="font-medium">{names[l.product_id]?.name || `#${l.product_id}`}</p>
                          {names[l.product_id]?.sku && <p className="text-xs text-muted-foreground">{names[l.product_id].sku}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQty(l.ordered)}</TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", l.can_make > 0 ? "text-primary" : "text-destructive")}>{fmtQty(l.can_make)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQty(l.remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Section icon={ShoppingCart} title="Components short: goes to the Purchase Manager" hint="Only what is missing for the units that cannot be made yet.">
              {shortages.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                  {plan.missing_bom?.length ? "No shortage can be worked out until the BOM is completed." : "Nothing to buy: every component is in stock."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="text-right">Needed</TableHead>
                        <TableHead className="text-right">Free stock</TableHead>
                        <TableHead className="text-right">To buy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shortages.map((s) => (
                        <TableRow key={s.component_id}>
                          <TableCell>
                            <p className="font-medium">{s.name}</p>
                            {s.sku && <p className="text-xs text-muted-foreground">{s.sku}</p>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtQty(s.required)} {s.unit}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtQty(s.available)} {s.unit}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-destructive">{fmtQty(s.shortage)} {s.unit}</TableCell>
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
                className="w-full rounded-[8px] border border-cf-line-strong bg-card px-3 py-2 text-[13px] outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}

/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Boxes, Loader2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import { Notice } from "@/components/feedback"
import { Field } from "@/components/FormField"
import { useToast } from "@/components/toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { errorMessage, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { useGetOrderPlanQuery, useReviseOrderMutation } from "./orderApprovalsApi"

/*
  Operations Admin: "we will make only this much of the order for now".
  For each product the screen shows how many units the stock on the shelf can build right now (GET .../plan, the same
  check as "Check stock & send"); the admin picks what will be made within that (0 .. can make now, pre-filled with it).
  The backend checks the stock again when saving (409 NOT_ENOUGH_STOCK). On save the order is split in two:
    * this order keeps those quantities and waits for the Marketing Manager to accept them,
    * the rest becomes a new draft on the Marketing Manager's side, to send again later.
  A reason is required: the Marketing Manager sees it next to both copies.
*/

/** Only a waiting order raised by marketing, and only once. */
export const canRevise = (o) => o?.approval_status === "PENDING_APPROVAL" && !o.revision && o.created_by_role === "MARKETING_MANAGER"

const INPUT =
  "h-9 w-24 rounded-lg border border-cf-line-strong bg-card px-2.5 text-end text-base tabular-nums outline-none transition-shadow focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:text-[13px]"

export default function ReviseQuantityModal({ order, onClose }) {
  const toast = useToast()
  const [revise, { isLoading: busy }] = useReviseOrderMutation()
  const { data: plan, isLoading: planLoading, isFetching: planFetching, error: planError } = useGetOrderPlanQuery(order.id)
  const [make, setMake] = useState({}) // product_id -> what the admin typed; a product not typed yet follows the stock
  const [remarks, setRemarks] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const canMakeBy = new Map((plan?.lines || []).map((l) => [l.product_id, Number(l.can_make) || 0]))
  const missingBom = new Set(plan?.missing_bom || [])
  const ready = Boolean(plan) && !planError

  const rows = order.items.map((it) => {
    const ordered = Number(it.quantity)
    const canMake = ready ? Math.min(canMakeBy.get(it.product_id) ?? 0, ordered) : null
    const raw = make[it.product_id] ?? (canMake === null ? "" : String(canMake))
    const value = raw === "" ? NaN : Number(raw)
    const valid = canMake !== null && Number.isInteger(value) && value >= 0 && value <= canMake
    return { ...it, ordered, canMake, raw, value, valid, held: valid ? ordered - value : 0 }
  })
  const totalCanMake = rows.reduce((s, r) => s + (r.canMake ?? 0), 0)
  const totalMake = rows.reduce((s, r) => s + (r.valid ? r.value : 0), 0)
  const totalHeld = rows.reduce((s, r) => s + r.held, 0)
  const allValid = rows.every((r) => r.valid)

  const problem = !ready
    ? "The stock check is not loaded yet."
    : !allValid
    ? "Each quantity must be a whole number between 0 and what the stock can make now."
    : totalHeld === 0
      ? "Nothing is reduced. To make the full order, use Check stock & send."
      : totalMake === 0
        ? "You would make nothing of this order: reject it instead."
        : ""
  const remarksError = showErrors && remarks.trim().length < 3 ? "Tell the Marketing Manager why the quantity is reduced." : ""

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    setShowErrors(true)
    if (problem || remarks.trim().length < 3) return
    try {
      await revise({ id: order.id, remarks: remarks.trim(), items: rows.map((r) => ({ product_id: r.product_id, quantity: r.value })) }).unwrap()
      toast.success(`${order.order_number} revised. The Marketing Manager has been asked to accept it.`)
      onClose()
    } catch (err) {
      setServerError(errorMessage(err, "Could not revise this order."))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      size="lg"
      title={`Revise quantity · ${order.order_number}`}
      description="See what the current stock can build, then choose how much you will make now. The rest is saved for the Marketing Manager as a separate draft order."
      footer={
        <>
          <MktBtn onClick={onClose} disabled={busy}>Cancel</MktBtn>
          <MktBtn type="submit" variant="primary" disabled={busy || !ready}>
            {busy && <Loader2 className="animate-spin" />}
            Send to Marketing for OK
          </MktBtn>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Notice title="Could not save">{serverError}</Notice>}
        {planError && <Notice title="Could not check the stock">{errorMessage(planError, "Close this window and try again.")}</Notice>}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-cf-head px-3.5 py-2.5 text-sm">
          <p className="inline-flex items-center gap-2">
            <Boxes className="size-4 text-primary" aria-hidden />
            {planLoading ? (
              <span className="text-muted-foreground">Checking the current stock...</span>
            ) : ready ? (
              <span>
                Current stock can make <b className="tabular-nums">{fmtQty(totalCanMake)}</b> of <span className="tabular-nums">{fmtQty(rows.reduce((s, r) => s + r.ordered, 0))}</span> units
                {planFetching && <span className="text-muted-foreground"> · updating</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">Stock not available</span>
            )}
          </p>
          {ready && Object.keys(make).length > 0 && (
            <MktBtn size="sm" variant="ghost" onClick={() => setMake({})}>Use stock maximum</MktBtn>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table data-cards="off">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Product</TableHead>
                <TableHead className="text-end">Ordered</TableHead>
                <TableHead className="text-end">Can make now</TableHead>
                <TableHead className="text-end">Will make</TableHead>
                <TableHead className="text-end">Not now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.product_id} className="hover:bg-transparent">
                  <TableCell className="whitespace-normal">
                    <p className="font-medium leading-snug">{r.name}</p>
                    {r.sku && <p className="text-xs text-muted-foreground">{r.sku}</p>}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{fmtQty(r.ordered)}</TableCell>
                  <TableCell className="text-end">
                    {r.canMake === null ? (
                      <span className="text-muted-foreground">...</span>
                    ) : (
                      <>
                        <span className={cn("font-semibold tabular-nums", r.canMake === 0 ? "text-destructive" : r.canMake < r.ordered ? "text-warning" : "text-primary")}>{fmtQty(r.canMake)}</span>
                        {missingBom.has(r.product_id) && <span className="block text-[11px] text-destructive">BOM missing</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.canMake ?? r.ordered}
                      disabled={!ready}
                      step={1}
                      aria-label={`Units of ${r.name} you will make`}
                      aria-invalid={showErrors && !r.valid}
                      value={r.raw}
                      onChange={(e) => setMake((m) => ({ ...m, [r.product_id]: e.target.value }))}
                      className={cn(INPUT, showErrors && !r.valid && "border-destructive")}
                    />
                  </TableCell>
                  <TableCell className={cn("text-end font-semibold tabular-nums", r.held > 0 ? "text-orange-700" : "text-muted-foreground")}>{fmtQty(r.held)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-cf-head hover:bg-cf-head">
                <TableCell className="text-xs font-semibold text-muted-foreground">Total units</TableCell>
                <TableCell className="text-end font-bold tabular-nums">{fmtQty(rows.reduce((s, r) => s + r.ordered, 0))}</TableCell>
                <TableCell className="text-end font-bold tabular-nums">{ready ? fmtQty(totalCanMake) : "-"}</TableCell>
                <TableCell className="text-end font-bold tabular-nums">{fmtQty(totalMake)}</TableCell>
                <TableCell className="text-end font-bold tabular-nums text-orange-700">{fmtQty(totalHeld)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {showErrors && problem && <p className="text-sm text-destructive">{problem}</p>}

        <Field label="Reason for the Marketing Manager" htmlFor="revise-remarks" required error={remarksError}>
          <textarea
            id="revise-remarks"
            rows={3}
            maxLength={500}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Line capacity is full this month, we can make 60 now"
            className="w-full rounded-[10px] border border-cf-line-strong bg-card px-3 py-2 text-base outline-none sm:text-[13px] transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          This order then waits for the Marketing Manager. Once they accept, it comes back to your queue with the reduced quantities and you can check stock & send it.
        </p>
      </div>
    </Modal>
  )
}

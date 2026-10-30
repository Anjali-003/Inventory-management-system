import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { MotionConfig } from "motion/react"
import { ChevronDown, ClipboardList, Loader2, Plus, ShoppingCart, X } from "lucide-react"
import { EmptyState } from "@/components/feedback"
import { useToast } from "@/components/toast"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { usePermissions } from "@/core/auth/usePermissions"
import { MktBtn, MktHero } from "@/sales/marketing-orders/mktKit"
import { useGetInventoryQuery } from "@/store/inventory/inventoryApi"
import { useGetApprovedOrdersQuery } from "@/sales/order-approvals/orderApprovalsApi"
import { useCreatePurchaseMutation, useGetPurchasesQuery } from "@/purchase/shared/purchasingApi"
import { ordersToOrder } from "@/purchase/shared/purchasingUtils"
import { onOrderByComponent } from "@/core/dashboard/rows"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { cn } from "@/lib/utils"
import { buildRows, needOf, suggestQty } from "./purchasePlan"

/*
  Purchase requests: every purchase request still pending (the components the Operations Admin sent for approved
  orders, not ordered yet), and the purchase manager's ONE combined purchase order for them.
    1. Pending requests: order by order, what each one is waiting for.
    2. Combined purchase order: all requests added up per component, in round figures (never below what the orders
       need, the server checks too), plus any low / out of stock component he adds. Supplier, then Place order.
  Roles that may only look at purchasing (store, IQC, operations) see part 1 only.
*/
const STEP = "auto" // 8 -> 10, 230 -> 250, 4,300 -> 4,500 (see purchasePlan.js)
const NONE = new Set()
const INPUT =
  "h-10 w-full rounded-[10px] border border-cf-line-strong bg-card px-3 text-base outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 sm:h-9 sm:text-[13px]"

export default function PurchaseRequests() {
  const { canEdit } = usePermissions()
  const editable = canEdit("purchase")
  const approved = useGetApprovedOrdersQuery()
  const inventory = useGetInventoryQuery("active", { skip: !editable })
  const purchases = useGetPurchasesQuery(undefined, { skip: !editable })

  const pending = useMemo(() => ordersToOrder(approved.data), [approved.data])
  const rows = useMemo(
    () => buildRows(approved.data, inventory.data, onOrderByComponent(purchases.data)),
    [approved.data, inventory.data, purchases.data]
  )
  const loading = approved.isLoading || (editable && inventory.isLoading)
  const components = new Set(pending.flatMap((g) => g.lines.map((l) => l.component_id))).size

  return (
    <MotionConfig reducedMotion="user">
      <MktHero
        eyebrow="Purchase"
        title="What to Buy"
        description="Everything the approved orders are still waiting for, and one combined purchase order to buy it all."
      />

      <PendingRequests pending={pending} loading={approved.isLoading} components={components} />

      {editable && !approved.isLoading && (
        // the form starts once the data is in, so its list can be filled from it
        <CombinedOrder key={loading ? "loading" : "ready"} rows={rows} loading={loading} />
      )}
    </MotionConfig>
  )
}

/* Part 1: the pending requests, one row per order; open a row to see its components. */
function PendingRequests({ pending, loading, components }) {
  const [open, setOpen] = useState(null)
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
        <div>
          <CardTitle>Pending requests</CardTitle>
          <CardDescription className="mt-1">
            {loading
              ? "Checking the orders..."
              : pending.length === 0
                ? "No approved order is waiting for components."
                : `${pending.length} order${pending.length === 1 ? "" : "s"} waiting for ${components} different component${components === 1 ? "" : "s"}.`}
          </CardDescription>
        </div>
      </div>
      {!loading && pending.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing pending">
          When the Operations Admin approves an order with short components, it shows up here.
        </EmptyState>
      ) : (
        <ul className="divide-y">
          {pending.map(({ order, lines }) => {
            const isOpen = open === order.id
            return (
              <li key={order.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : order.id)}
                  className="flex w-full items-center gap-4 px-5 py-3 text-start outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tabular-nums">{order.order_number}</span>
                    <span className="block text-xs text-muted-foreground">
                      {order.approved_at ? `Approved ${fmtDateTime(order.approved_at)}` : "Approved"}
                      {order.created_by_name ? ` · raised by ${order.created_by_name}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{lines.length} component{lines.length === 1 ? "" : "s"}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen && (
                  <ul className="grid gap-1 bg-muted/40 px-5 py-3 text-sm sm:grid-cols-2">
                    {lines.map((l) => (
                      <li key={l.request_item_id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate">{l.name} <span className="text-xs text-muted-foreground">{l.sku}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums">{fmtQty(l.quantity)} {l.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/*
  Under the rate box: the expected cost it started from and the last rate paid, so a typing slip (₹10,050 for a
  ₹0.20 part) stands out. Rates do change, so nothing is blocked; a rate far off (10x either way) is only flagged.
*/
const rupee = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
function RateHint({ row, typed }) {
  const n = Number(typed)
  const ref = row.expectedRate ?? row.lastRate
  const farOff = ref > 0 && n > 0 && (n / ref >= 10 || ref / n >= 10)
  const parts = [row.expectedRate !== null && `Expected ${rupee(row.expectedRate)}`, row.lastRate !== null && `last paid ${rupee(row.lastRate)}`].filter(Boolean)
  if (!parts.length && !farOff) return null
  return (
    <span className={cn("mt-0.5 block text-end text-[11px] leading-tight", farOff ? "font-semibold text-destructive" : "text-muted-foreground")}>
      {farOff ? `Check: ${Math.round(n / ref) >= 10 ? `${Math.round(n / ref).toLocaleString("en-IN")}x` : "far below"} ${row.expectedRate !== null ? "the expected cost" : "the last rate"} (${rupee(ref)})` : parts.join(", ")}
    </span>
  )
}

/* Part 2: one purchase order for all pending requests (plus any low / out of stock component added). */
function CombinedOrder({ rows, loading }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [create, { isLoading: saving }] = useCreatePurchaseMutation()
  const byId = useMemo(() => new Map(rows.map((r) => [r.component_id, r])), [rows])

  // starts with every component a pending request asks for
  const [list, setList] = useState(() => rows.filter((r) => r.lines.length > 0).map((r) => r.component_id))
  const [qty, setQty] = useState({}) // component_id -> typed quantity (missing = the suggestion)
  const [rate, setRate] = useState({}) // component_id -> typed rate per piece (missing = the expected cost)
  const [adding, setAdding] = useState("")
  const [supplier, setSupplier] = useState("")
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState("")

  const lines = list.map((id) => byId.get(id)).filter(Boolean)
  const qtyOf = (r) => qty[r.component_id] ?? String(suggestQty(r, NONE, STEP))
  // filled in with the expected cost; the purchase manager changes it to what the supplier quoted
  const rateOf = (r) => rate[r.component_id] ?? (r.expectedRate === null ? "" : String(r.expectedRate))
  const errorOf = (r) => {
    const text = qtyOf(r).trim()
    const n = Number(text)
    if (!text || !Number.isFinite(n) || n <= 0) return "Enter a quantity above 0"
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return "Up to 2 decimals"
    const need = needOf(r)
    if (n < need) return `Orders need at least ${fmtQty(need)}`
    const price = rateOf(r).trim()
    if (!price || !/^\d+(\.\d{1,2})?$/.test(price)) return "Enter the rate per piece"
    return ""
  }
  const value = lines.reduce((sum, r) => sum + (Number(qtyOf(r)) || 0) * (Number(rateOf(r)) || 0), 0)
  const remove = (id) => setList((l) => l.filter((x) => x !== id))
  const addable = rows.filter((r) => !list.includes(r.component_id))
  // low / out of stock and not on the order yet: out of stock first
  const lowStock = addable.filter((r) => r.low).sort((a, b) => Number(b.out) - Number(a.out) || a.onHand - b.onHand)
  const addIds = (ids) => setList((l) => [...l, ...ids.filter((id) => !l.includes(id))])
  const add = (value) => {
    const r = addable.find((x) => `${x.name} · ${x.sku}` === value)
    if (!r) return
    setList((l) => [...l, r.component_id])
    setAdding("")
  }

  const orderCount = new Set(lines.flatMap((r) => r.lines.map((l) => l.order_id))).size
  const supplierError = supplier.trim().length < 2 ? "Enter the supplier name" : !expectedDate ? "Enter the date the supplier will deliver" : ""
  const bad = lines.filter((r) => errorOf(r))

  const submit = async (e) => {
    e.preventDefault()
    setServerError("")
    setShowErrors(true)
    if (supplierError || lines.length === 0 || bad.length) {
      // the field to fix may be far above the button: take him there
      const el = supplierError ? document.getElementById("co-supplier") : document.querySelector(`[data-qty="${bad[0]?.component_id}"]`)
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      el?.focus({ preventScroll: true })
      return
    }
    try {
      const po = await create({
        supplier: supplier.trim(),
        expected_delivery_date: expectedDate,
        notes: notes.trim(),
        items: lines.map((r) => ({
          component_id: r.component_id,
          quantity: qtyOf(r).trim(),
          rate: rateOf(r).trim(),
          request_item_ids: r.lines.map((l) => l.request_item_id),
        })),
      }).unwrap()
      toast.success(`${po.po_number} placed: ${lines.length} component${lines.length === 1 ? "" : "s"}`)
      navigate(`/purchase?purchase=${po.id}`)
    } catch (err) {
      const msg = errorMessage(err, "Could not place the order.")
      setServerError(msg)
      toast.error(msg)
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-labelledby="co-title">
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <CardTitle id="co-title">Combined purchase order</CardTitle>
          <CardDescription className="mt-1">
            All pending requests added up per component, rounded up to round figures. Change any quantity, remove a line, or add low and out of stock components from below.
          </CardDescription>
        </div>

        <div className="space-y-5 p-5">
          {serverError && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-cf-red-soft px-4 py-3 text-sm text-destructive">{serverError}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="co-supplier" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Supplier <span className="text-destructive" aria-hidden>*</span></label>
              <input id="co-supplier" maxLength={150} autoComplete="off" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-invalid={showErrors && !!supplierError} className={cn(INPUT, showErrors && supplierError && "border-destructive")} />
              {showErrors && supplierError && <p className="mt-1.5 text-xs font-medium text-destructive">{supplierError}</p>}
            </div>
            <div>
              <label htmlFor="co-expected" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Supplier will deliver by <span className="text-destructive" aria-hidden>*</span></label>
              <input id="co-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} aria-invalid={showErrors && !expectedDate} className={cn(INPUT, showErrors && !expectedDate && "border-destructive")} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="co-notes" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Notes</label>
              <input id="co-notes" maxLength={500} autoComplete="off" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={INPUT} />
            </div>
          </div>

          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Working out what to buy...</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table data-cards="off" className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Component</th>
                    <th className="px-3 py-2 text-end font-semibold">Orders need</th>
                    <th className="hidden px-3 py-2 text-end font-semibold sm:table-cell">In stock</th>
                    <th className="w-40 px-3 py-2 text-end font-semibold">Order qty</th>
                    <th className="w-32 px-3 py-2 text-end font-semibold">Rate / piece (₹)</th>
                    <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nothing on the order. Add low or out of stock components from below, or any other component.</td></tr>
                  )}
                  {lines.map((r) => {
                    const need = needOf(r)
                    const err = showErrors ? errorOf(r) : ""
                    return (
                      <tr key={r.component_id} className="align-top">
                        <td className="px-3 py-2.5">
                          <p className="font-medium leading-snug">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.sku}
                            {r.out ? <span className="ms-2 font-semibold text-destructive">Out of stock</span> : r.low ? <span className="ms-2 font-semibold text-warning">Low stock</span> : null}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">
                          {need > 0 ? (
                            <span title={r.lines.map((l) => `${l.order_number}: ${fmtQty(l.quantity)}`).join("\n")}>
                              {fmtQty(need)}
                              <span className="block text-xs text-muted-foreground">{r.lines.length} order{r.lines.length === 1 ? "" : "s"}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-2.5 text-end tabular-nums sm:table-cell">
                          {fmtQty(r.onHand)}
                          {r.minimum > 0 && <span className="block text-xs text-muted-foreground">min {fmtQty(r.minimum)}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <input
                              inputMode="decimal"
                              data-qty={r.component_id}
                              aria-label={`Quantity of ${r.name}`}
                              aria-invalid={!!err}
                              value={qtyOf(r)}
                              onChange={(e) => setQty((q) => ({ ...q, [r.component_id]: e.target.value }))}
                              className={cn(INPUT, "text-end font-semibold tabular-nums", err && "border-destructive")}
                            />
                            <span className="w-7 shrink-0 text-xs text-muted-foreground">{r.unit}</span>
                          </span>
                          {err && <span className="mt-1 block text-end text-xs font-medium text-destructive">{err}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            inputMode="decimal"
                            aria-label={`Rate per piece of ${r.name}`}
                            value={rateOf(r)}
                            onChange={(e) => setRate((x) => ({ ...x, [r.component_id]: e.target.value }))}
                            placeholder="0.00"
                            className={cn(INPUT, "text-end tabular-nums", showErrors && !rateOf(r).trim() && "border-destructive")}
                          />
                          <span className="mt-1 block text-end text-xs text-muted-foreground tabular-nums">
                            ₹{((Number(qtyOf(r)) || 0) * (Number(rateOf(r)) || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                          </span>
                          <RateHint row={r} typed={rateOf(r)} />
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            aria-label={`Remove ${r.name}`}
                            onClick={() => remove(r.component_id)}
                            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-cf-red-soft hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            <X className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* anything else: type to find it, pick it, it joins the list */}
              <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2.5">
                <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  list="co-components"
                  aria-label="Add a component"
                  value={adding}
                  onChange={(e) => { setAdding(e.target.value); add(e.target.value) }}
                  placeholder="Add a component (type name or SKU)"
                  className={cn(INPUT, "bg-card")}
                />
                <datalist id="co-components">
                  {addable.map((r) => <option key={r.component_id} value={`${r.name} · ${r.sku}`} />)}
                </datalist>
              </div>
            </div>
          )}
          {showErrors && bad.length > 0 && <p className="text-sm font-medium text-destructive">Fix the quantity or rate of {bad.map((r) => r.name).join(", ")}.</p>}

          {!loading && (
            <section aria-labelledby="co-low-title" className="rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <h3 id="co-low-title" className="text-sm font-semibold">Low and out of stock</h3>
                  <p className="text-xs text-muted-foreground">
                    {lowStock.length === 0
                      ? "Every component is above its minimum, or already on this order."
                      : `${lowStock.length} component${lowStock.length === 1 ? "" : "s"} at or below the minimum stock, not on this order yet.`}
                  </p>
                </div>
                {lowStock.length > 0 && (
                  <MktBtn size="sm" onClick={() => addIds(lowStock.map((r) => r.component_id))}>
                    <Plus /> Add all ({lowStock.length})
                  </MktBtn>
                )}
              </div>
              {lowStock.length > 0 && (
                <ul className="max-h-64 divide-y overflow-y-auto">
                  {lowStock.map((r) => (
                    <li key={r.component_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.sku} · in stock {fmtQty(r.onHand)}, minimum {fmtQty(r.minimum)}
                          {r.onOrder > 0 && ` · ${fmtQty(r.onOrder)} already on order`}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", r.out ? "bg-cf-red-soft text-destructive" : "bg-cf-amber-soft text-warning")}>
                        {r.out ? "Out of stock" : "Low stock"}
                      </span>
                      <MktBtn size="sm" className="shrink-0" onClick={() => addIds([r.component_id])} aria-label={`Add ${r.name} to the order`}>
                        <Plus /> Add
                      </MktBtn>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* stays in reach while the list scrolls */}
        <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-cf-head/95 px-5 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              <b className="tabular-nums text-foreground">{lines.length}</b> component{lines.length === 1 ? "" : "s"}
              {orderCount > 0 && <> · covers <b className="tabular-nums text-foreground">{orderCount}</b> order{orderCount === 1 ? "" : "s"}</>}
            </p>
            {/* why the order did not go, right next to the button */}
            {showErrors && (supplierError || bad.length > 0 || serverError) && (
              <p role="alert" className="mt-0.5 text-sm font-medium text-destructive">
                {serverError || (supplierError ? `${supplierError} (top of the form).` : `Fix the quantity or rate of ${bad.map((r) => r.name).join(", ")}.`)}
              </p>
            )}
          </div>
          <span className="text-sm text-muted-foreground">Order value <b className="tabular-nums text-foreground">₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b></span>
          <MktBtn type="submit" variant="primary" disabled={saving || loading || lines.length === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <ShoppingCart />} Place order
          </MktBtn>
        </div>
      </Card>
    </form>
  )
}

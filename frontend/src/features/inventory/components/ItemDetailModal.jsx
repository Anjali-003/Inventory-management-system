import { useEffect, useState } from "react"
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react"
import { inventoryService } from "@/features/inventory/inventoryService"
import { Modal } from "@/components/Modal"
import { Button } from "@/components/ui/button"
import { Notice, TableSkeleton } from "@/components/feedback"
import { MovementList } from "./Ledger"
import { StockBadge } from "./StockBadge"
import { errorMessage, fmtDateTime, fmtQty } from "@/lib/stock"
import { usePermissions } from "@/features/auth/usePermissions"
import { TextInput } from "@/components/FormField"

const rupee = (v) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/*
  What one piece costs: the last purchase rate when it was bought with one, otherwise the standard cost (an estimate).
  The Super Admin can change the standard cost here.
*/
function CostTile({ item, onSaved }) {
  const { canEdit } = usePermissions()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  const bought = item.last_purchase_rate !== null && item.last_purchase_rate !== undefined
  const save = async () => {
    try {
      setError("")
      await inventoryService.setCost(item.id, value)
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(errorMessage(e, "Could not save the cost."))
    }
  }
  return (
    <div className="bg-card px-3.5 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost / piece</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-1.5">
          <TextInput aria-label="Standard cost per piece" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-24" />
          <Button size="sm" onClick={save}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <p className="mt-0.5 text-xl font-semibold tabular-nums">
          {bought ? rupee(item.last_purchase_rate) : item.standard_cost !== null && item.standard_cost !== undefined ? rupee(item.standard_cost) : "—"}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {bought ? "Last purchase rate" : item.standard_cost !== null && item.standard_cost !== undefined ? "Estimated (standard cost)" : "Not set"}
        {canEdit("inventory") && !editing && (
          <button type="button" className="ml-1.5 font-semibold text-primary hover:underline" onClick={() => { setValue(item.standard_cost ?? ""); setEditing(true) }}>
            {bought ? "Standard cost" : "Edit"}
          </button>
        )}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

const Tile = ({ label, value, sub }) => (
  <div className="bg-card px-3.5 py-3">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
)

export default function ItemDetailModal({ open, itemId, refreshToken, onClose, onIn, onOut, onLedger }) {
  const [item, setItem] = useState(null)
  const [error, setError] = useState("")
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!open || !itemId) return
    let stale = false
    setError("")
    inventoryService.getItem(itemId).then((r) => !stale && setItem(r.data)).catch((e) => !stale && setError(errorMessage(e, "Could not load this item.")))
    return () => { stale = true }
  }, [open, itemId, refreshToken, version])

  const active = item && item.is_active === 1
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? item.component_name : "Inventory item"}
      description={item ? [item.sku, item.unit, item.category, item.size && `Size ${item.size}`, item.location && `Location: ${item.location}`].filter(Boolean).join(" · ") : undefined}
      footer={
        item && (
          <>
            {onLedger && <Button variant="outline" size="lg" onClick={() => onLedger(item)}><History /> Full ledger</Button>}
            {onOut && <Button variant="outline" size="lg" onClick={() => onOut(item)} disabled={!active}><ArrowUpFromLine /> Stock out</Button>}
            {onIn && <Button size="lg" onClick={() => onIn(item)}><ArrowDownToLine /> Stock in</Button>}
          </>
        )
      }
    >
      {error ? (
        <Notice title="Something went wrong">{error}</Notice>
      ) : !item ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge item={item} />
            {item.last_movement_at && <span className="text-xs text-muted-foreground">Last movement {fmtDateTime(item.last_movement_at)}</span>}
          </div>

          {item.in_sync === 0 && (
            <div role="alert" className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>On-hand ({fmtQty(item.quantity_on_hand)}) differs from the ledger total ({fmtQty(item.ledger_balance)}).</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
            <Tile label="On hand" value={fmtQty(item.quantity_on_hand)} />
            <CostTile item={item} onSaved={() => setVersion((v) => v + 1)} />
            <Tile label="Minimum" value={fmtQty(item.minimum_stock_level)} sub="alert level" />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Recent movements</h3>
            <MovementList rows={item.recent_movements} />
          </div>
        </div>
      )}
    </Modal>
  )
}

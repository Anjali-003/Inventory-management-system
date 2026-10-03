import { useEffect, useState } from "react"
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react"
import api from "../../api/api"
import { Modal } from "../Modal"
import { Button } from "../ui/button"
import { Notice, TableSkeleton } from "../feedback"
import { MovementList } from "./Ledger"
import { StockBadge } from "./StockBadge"
import { errorMessage, fmtDateTime, fmtQty } from "../../lib/stock"

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

  useEffect(() => {
    if (!open || !itemId) return
    let stale = false
    setError("")
    api.get(`/inventory/${itemId}`).then((r) => !stale && setItem(r.data)).catch((e) => !stale && setError(errorMessage(e, "Could not load this item.")))
    return () => { stale = true }
  }, [open, itemId, refreshToken])

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
            <Button variant="outline" size="lg" onClick={() => onLedger(item)}><History /> Full ledger</Button>
            <Button variant="outline" size="lg" onClick={() => onOut(item)} disabled={!active}><ArrowUpFromLine /> Stock out</Button>
            <Button size="lg" onClick={() => onIn(item)}><ArrowDownToLine /> Stock in</Button>
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

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <Tile label="On hand" value={fmtQty(item.quantity_on_hand)} />
            <Tile label="Reserved" value={fmtQty(item.quantity_reserved)} sub="for production" />
            <Tile label="Available" value={fmtQty(item.available)} />
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

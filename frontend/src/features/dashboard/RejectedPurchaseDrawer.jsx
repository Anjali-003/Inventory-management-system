import { Download } from "lucide-react"
import TabbedDrawer, { Fact } from "@/components/TabbedDrawer"
import { MktBtn } from "@/features/marketing-orders/mktKit"
import { downloadRejected, rejectedLines } from "@/features/purchasing/purchasingUtils"
import { fmtDateTime } from "@/lib/stock"

/*
  What the Purchase Manager needs when they open a REJECTED purchase: which components IQC threw out, why,
  and who the supplier is, so they can chase a replacement / credit note / return. Nothing else
  (no steps, no timeline, no store info). The normal PurchaseDrawer stays as is for the Purchase page.
*/

function Body({ purchase: p }) {
  const rejected = rejectedLines(p)
  const entireLot = rejected.length === 0
  const lines = entireLot ? p.items ?? [] : rejected
  const count = lines.length

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3.5">
        <p className="text-sm font-bold text-rose-900">
          {entireLot ? "IQC rejected the entire shipment" : `IQC rejected ${count} ${count === 1 ? "component" : "components"}`}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-rose-900/80">
          Follow up with {p.supplier || "the supplier"} for a replacement, credit note or return.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2.5">
        <Fact label="Supplier">{p.supplier || "-"}</Fact>
        <Fact label="Inspected on">{p.iqc_at ? fmtDateTime(p.iqc_at) : "-"}</Fact>
        <Fact label="Inspected by">{p.iqc_by_name || "IQC Inspector"}</Fact>
        {p.order_number && <Fact label="For order">{p.order_number}</Fact>}
      </dl>

      {p.iqc_remarks && (
        <p className="rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-3 text-sm leading-snug text-violet-900">
          <span className="font-semibold">IQC remarks: </span>{p.iqc_remarks}
        </p>
      )}

      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold">{entireLot ? "Components in this shipment" : "Rejected components"}</h3>
        <ul className="space-y-2">
          {lines.map((it) => (
            <li key={it.id} className="rounded-xl border border-rose-200 bg-rose-50/50 px-3.5 py-3">
              <p className="break-words text-sm font-semibold leading-snug">{it.name}</p>
              <p className="text-xs text-muted-foreground">{it.sku}</p>
              <p className="mt-2 text-sm leading-snug text-rose-900">
                <span className="font-semibold">Reason: </span>{it.remarks || p.iqc_remarks || "No reason given"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** `purchase={null}` keeps it closed. */
export default function RejectedPurchaseDrawer({ purchase, onClose }) {
  const p = purchase
  return (
    <TabbedDrawer
      open={!!p}
      eyebrow="Rejected by IQC"
      title={p ? p.po_number : ""}
      subtitle={p ? <span>{p.supplier}</span> : null}
      tabs={[]}
      tab="rejected"
      onClose={onClose}
      tabContent={p ? { rejected: <Body purchase={p} /> } : undefined}
      actions={p ? <MktBtn onClick={() => downloadRejected(p)}><Download /> Download rejection slip</MktBtn> : null}
    />
  )
}

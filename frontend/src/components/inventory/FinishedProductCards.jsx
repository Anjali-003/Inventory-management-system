import { PackageCheck } from "lucide-react"
import { motion } from "motion/react"
import { Initials } from "./HistoryUI"
import { EmptyState } from "../feedback"
import { cn } from "../../lib/utils"
import { fmtQty } from "../../lib/stock"

/*
    Finished products and the components they used (tab content on the Inventory History page).
    components used = quantity produced x components in ONE unit (sum of its BOM quantities).
    `data` is the response of GET /inventory/history/products (total_produced = all finished products made);
    the share bar is only a drawing.
*/

const th = "h-[34px] whitespace-nowrap px-[18px] text-[9px] font-bold uppercase tracking-[0.5px] text-cf-faint"

export default function FinishedProductCards({ data }) {
  const products = data?.products ?? []
  const total = Number(data?.total_components_used ?? 0)
  const totalProduced = Number(data?.total_produced ?? 0)

  if (products.length === 0) {
    return (
      <EmptyState icon={PackageCheck} title="No finished products yet">
        Products appear here once they pass quality control.
      </EmptyState>
    )
  }

  const summary = [
    { key: "made", label: "Products made", value: fmtQty(totalProduced), hint: "Units that passed quality control", accent: true },
    { key: "types", label: "Product types", value: products.length, hint: "Different products made so far" },
    { key: "used", label: "Components used", value: fmtQty(total), hint: "Consumed by all finished products" },
  ]

  return (
    <div>
      <div className="grid border-b bg-gradient-to-r from-cf-head/65 via-white to-white sm:grid-cols-3 sm:divide-x max-sm:divide-y">
        {summary.map((c) => (
          <div key={c.key} className="px-5 py-[18px]">
            <p className="text-[11px] font-semibold text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1.5 text-[22px] font-bold leading-tight tracking-[-0.6px] tabular-nums", c.accent && "text-primary")}>{c.value}</p>
            <p className="mt-0.5 text-[10px] text-cf-faint">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="max-h-[22rem] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 border-b bg-cf-head">
            <tr>
              <th scope="col" className={`${th} text-left`}>Product</th>
              <th scope="col" className={`${th} text-right`}>Produced</th>
              <th scope="col" className={`${th} text-right`}>Per unit</th>
              <th scope="col" className={`${th} text-right`}>Components used</th>
              <th scope="col" className={`${th} hidden w-44 text-left xl:table-cell`}>Share</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const share = total > 0 ? Math.min(100, (Number(p.components_used) / total) * 100) : 0
              return (
                <motion.tr
                  key={p.product_id}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.07, duration: 0.3, ease: "easeOut" }}
                  className="border-t transition-colors first:border-t-0 hover:bg-emerald-50/60"
                >
                  <td className="px-[18px] py-3">
                    <div className="flex items-center gap-3">
                      <Initials name={p.name} />
                      <div className="min-w-0">
                        <p className="font-semibold">{p.name}</p>
                        <p className="mt-0.5 text-[10px] text-cf-faint">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-[18px] py-3 text-right tabular-nums">{fmtQty(p.produced)}</td>
                  <td className="px-[18px] py-3 text-right tabular-nums text-muted-foreground">{fmtQty(p.components_per_unit)}</td>
                  <td className="px-[18px] py-3 text-right font-bold tabular-nums">{fmtQty(p.components_used)}</td>
                  <td className="hidden px-[18px] py-3 xl:table-cell">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(share)}% of all components used`}>
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${share}%` }}
                          transition={{ delay: 0.25 + i * 0.07, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="w-9 text-[10px] tabular-nums text-muted-foreground">{Math.round(share)}%</span>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 border-t bg-cf-head">
            <tr>
              <th scope="row" className="px-[18px] py-3 text-left text-[11px] font-bold">Total</th>
              <td className="px-[18px] py-3 text-right font-bold tabular-nums">{fmtQty(totalProduced)}</td>
              <td />
              <td className="px-[18px] py-3 text-right font-bold tabular-nums">{fmtQty(total)}</td>
              <td className="hidden xl:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

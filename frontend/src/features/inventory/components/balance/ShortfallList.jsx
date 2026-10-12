import { EmptyState } from "@/components/feedback";
import { PackageSearch } from "lucide-react";
import { ItemCard } from "./ItemCard";
import { fmtQty } from "@/lib/stock";
import { TONE_TEXT } from "./balanceTheme";

export default function ShortfallList({
  byComponent,
  comps,
  find,
  open,
  reasons,
  sf,
}) {
  return (
    <div className="p-[18px]">
      {byComponent ? (
        sf.components.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No component is short">
            Every component is at or above its expected quantity.
          </EmptyState>
        ) : comps.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No component matches "{find}".
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3">
            {comps.map((c, i) => {
              const m = Number(c.missing);
              const extra = m <= 0;
              return (
                <ItemCard
                  key={c.component_id}
                  index={i}
                  title={c.name}
                  sub={c.sku}
                  value={extra ? `+${fmtQty(Math.abs(m))}` : fmtQty(m)}
                  unit={c.unit}
                  caption={extra ? `${c.unit} extra` : `${c.unit} missing`}
                  valueClass={extra ? TONE_TEXT.success : TONE_TEXT.danger}
                  onClick={() => open({ kind: "entries", sku: c.sku })}
                />
              );
            })}
          </div>
        )
      ) : sf.by_reason.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No stock-outs recorded">
          Nothing has been taken out or adjusted, so the shortfall has no
          recorded cause yet.
        </EmptyState>
      ) : reasons.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No reason matches "{find}".
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3">
          {reasons.map((g, i) => (
            <ItemCard
              key={g.code}
              index={i}
              title={g.label}
              sub={`${g.movements} ${g.movements === 1 ? "entry" : "entries"}`}
              value={fmtQty(g.quantity)}
              caption="taken out"
              onClick={() => open({ kind: "entries", code: g.code })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

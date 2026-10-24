/* eslint-disable react-refresh/only-export-components */
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MktBtn } from "@/features/marketing-orders/mktKit";
import { plural } from "@/features/marketing-orders/orderParts";
import { downloadPurchaseList } from "@/features/purchasing/purchasingUtils";
import { fmtQty } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { canApprove, planTotals, planVerdict } from "./approvalParts";
import { useGetOrderPlanQuery } from "./orderApprovalsApi";

/* Tabs of the Operations Admin's order drawer (OpsOrderDrawer.jsx). */
export const OPS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Products" },
  { id: "feasibility", label: "Stock check" },
  { id: "timeline", label: "Timeline" },
];

const Heading = ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>;
const Note = ({ children }) => (
  <p className="rounded-xl border border-dashed px-3.5 py-3 text-sm text-muted-foreground">{children}</p>
);

/* "Stock check" tab: the live stock check while the order waits; what was handed over once it is decided. */
export function FeasibilityTab({ order }) {
  const waiting = canApprove(order);
  const { data: plan, isLoading, error } = useGetOrderPlanQuery(order.id, { skip: !waiting });
  const names = Object.fromEntries(order.items.map((i) => [i.product_id, i.name]));

  if (!waiting) {
    const prod = order.production_request;
    const purch = order.purchase_request;
    return (
      <div className="space-y-5">
        <section>
          <Heading>Sent to Production</Heading>
          {prod?.items?.length ? (
            <ul className="space-y-1 rounded-xl border p-3 text-sm">
              {prod.items.map((i) => (
                <li key={i.product_id} className="flex justify-between gap-3">
                  <span>{i.name}</span>
                  <b className="tabular-nums">{fmtQty(i.quantity)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Note>Nothing was sent to Production.</Note>
          )}
        </section>
        <section>
          {purch?.items?.length ? (
            <Accordion
              headerClassName="rounded-lg"
              panelClassName="pt-2"
              actions={
                <MktBtn size="sm" aria-label="Download components sent to Purchase (Excel)" onClick={() => downloadPurchaseList(order, purch.items)}>
                  <Download /> Excel
                </MktBtn>
              }
              header={(open) => (
                <>
                  <h3 className="text-sm font-semibold">Components sent to Purchase</h3>
                  {!open && (
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {purch.items.slice(0, 3).map((i) => i.name).join(", ")}
                      {purch.items.length > 3 && ` +${purch.items.length - 3} more`}
                    </p>
                  )}
                </>
              )}
            >
              <ul className="space-y-1 rounded-xl border p-3 text-sm">
                {purch.items.map((i) => (
                  <li key={i.component_id} className="flex justify-between gap-3">
                    <span>
                      {i.name}
                      {i.sku ? <span className="text-muted-foreground"> · {i.sku}</span> : null}
                    </span>
                    <b className="tabular-nums">
                      {fmtQty(i.quantity)}
                      {i.unit ? ` ${i.unit}` : ""}
                    </b>
                  </li>
                ))}
              </ul>
            </Accordion>
          ) : (
            <>
              <Heading>Components sent to Purchase</Heading>
              <Note>No components were sent to Purchase.</Note>
            </>
          )}
        </section>
      </div>
    );
  }

  if (isLoading) return <Note>Checking stock...</Note>;
  if (error || !plan) return <Note>Stock check unavailable.</Note>;
  const verdict = planVerdict(plan);
  const { ordered, canMake, remaining } = planTotals(plan);
  const shortages = plan.shortages || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
        <span>
          Ordered <b className="tabular-nums">{fmtQty(ordered)}</b>
        </span>
        <span>
          Can make now <b className="tabular-nums text-primary">{fmtQty(canMake)}</b>
        </span>
        <span>
          Short{" "}
          <b className={cn("tabular-nums", remaining > 0 && "text-destructive")}>{fmtQty(remaining)}</b>
        </span>
      </div>

      <section>
        <Heading>By product</Heading>
        <div className="overflow-hidden rounded-xl border">
          <Table data-cards="off">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-3! h-8!">Product</TableHead>
                <TableHead className="px-3! h-8! text-end">Ordered</TableHead>
                <TableHead className="px-3! h-8! text-end">Can make now</TableHead>
                <TableHead className="px-3! h-8! text-end">Short</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plan.lines || []).map((l) => (
                <TableRow key={l.product_id}>
                  <TableCell className="px-3! py-1! whitespace-normal">
                    {names[l.product_id] || `Product #${l.product_id}`}
                  </TableCell>
                  <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(l.ordered)}</TableCell>
                  <TableCell className={cn("px-3! py-1! text-end font-semibold tabular-nums", l.can_make > 0 ? "text-primary" : "text-destructive")}>
                    {fmtQty(l.can_make)}
                  </TableCell>
                  <TableCell className={cn("px-3! py-1! text-end tabular-nums", Number(l.remaining) > 0 && "font-semibold text-destructive")}>
                    {fmtQty(l.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {plan.missing_bom?.length > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Bill of materials missing for {plural(plan.missing_bom.length, "product")}.
          </p>
        )}
      </section>

      <section>
        <Heading>Components to buy</Heading>
        {shortages.length === 0 ? (
          <Note>
            {plan.missing_bom?.length
              ? "No shortage can be worked out until the BOM is completed."
              : "Nothing to buy: every component is in stock."}
          </Note>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table data-cards="off">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3! h-8!">Component</TableHead>
                  <TableHead className="px-3! h-8! text-end">Required</TableHead>
                  <TableHead className="px-3! h-8! text-end">In stock</TableHead>
                  <TableHead className="px-3! h-8! text-end">Short</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortages.map((c) => (
                  <TableRow key={c.component_id}>
                    <TableCell className="px-3! py-1! whitespace-normal">
                      {c.name}
                      {c.sku ? <span className="block text-xs text-muted-foreground">{c.sku}</span> : null}
                    </TableCell>
                    <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(c.required)}</TableCell>
                    <TableCell className="px-3! py-1! text-end tabular-nums">{fmtQty(c.available)}</TableCell>
                    <TableCell className="px-3! py-1! text-end font-semibold tabular-nums text-destructive">
                      {fmtQty(c.shortage)}
                      {c.unit ? ` ${c.unit}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

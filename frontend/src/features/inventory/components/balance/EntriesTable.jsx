import { ClipboardList } from "lucide-react";
import { fmtDateTime, fmtQty } from "@/lib/stock";
import { Pill, reasonTone } from "@/components/HistoryUI";
import { cn } from "@/lib/utils";
import { TEXT } from "./balanceTheme";

/*
    Balance sheet tab:  received - components used = expected remaining, compared with what is actually on hand.
    Shortfall tab: when stock is short, where it went, grouped by reason (the same reasons as Stock out),
    then entry by entry with quantity and order.
    `balance` is the response of GET /inventory/history/balance; nothing is calculated in the browser.
*/

const th =
  "h-[34px] whitespace-nowrap px-[18px] text-[9px] font-bold uppercase tracking-[0.5px] text-cf-faint";

export function OrderCell({ m }) {
  return m.order_number ? (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-accent px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
        <ClipboardList className="size-3" aria-hidden />
        {m.order_number}
      </span>
      {m.recorded_by && (
        <p className="mt-1 text-xs text-muted-foreground">
          Entered by {m.recorded_by}
        </p>
      )}
    </div>
  ) : (
    <div className="text-muted-foreground">
      {/* older entries (before stock-outs were tied to orders) keep the worker they were saved with */}
      <p>{m.worker_name ? `Worker: ${m.worker_name}` : "-"}</p>
      {m.recorded_by && (
        <p className="mt-1 text-xs">Entered by {m.recorded_by}</p>
      )}
    </div>
  );
}

export function EntriesTable({ rows, showComponent, showReason }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 z-10 border-b bg-cf-head">
        <tr>
          <th scope="col" className={`${th} text-left`}>
            Date
          </th>
          {showComponent && (
            <th scope="col" className={`${th} text-left`}>
              Component
            </th>
          )}
          {showReason && (
            <th scope="col" className={`${th} text-left`}>
              Reason
            </th>
          )}
          <th scope="col" className={`${th} text-right`}>
            Qty
          </th>
          <th scope="col" className={`${th} text-left`}>
            Order
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr
            key={m.id}
            className="border-t transition-colors first:border-t-0 hover:bg-cf-head"
          >
            <td className="whitespace-nowrap px-[18px] py-3 tabular-nums text-muted-foreground">
              {fmtDateTime(m.created_at)}
            </td>
            {showComponent && (
              <td className="whitespace-nowrap px-[18px] py-3">
                <p className="font-semibold">{m.component_name}</p>
                <p className="mt-0.5 text-[11px] text-cf-faint">{m.sku}</p>
              </td>
            )}
            {showReason && (
              <td className="px-[18px] py-3">
                <Pill tone={reasonTone(m.code)}>{m.reason_label}</Pill>
                {(m.reason || m.reference_no) && (
                  <p
                    className="mt-1 max-w-56 truncate text-xs text-muted-foreground"
                    title={m.reason || ""}
                  >
                    {m.reason}
                    {m.reference_no ? ` (${m.reference_no})` : ""}
                  </p>
                )}
              </td>
            )}
            <td
              className={cn(
                "whitespace-nowrap px-[18px] py-3 text-right font-semibold tabular-nums",
                Number(m.quantity) < 0 && TEXT.success,
              )}
            >
              {fmtQty(m.quantity)}{" "}
              <span className="text-[11px] font-normal text-muted-foreground">
                {m.unit}
              </span>
            </td>
            <td className="whitespace-nowrap px-[18px] py-3">
              <OrderCell m={m} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

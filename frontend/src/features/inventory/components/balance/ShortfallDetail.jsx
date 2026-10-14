import { useState } from "react";
import { fmtQty } from "@/lib/stock";
import AllEntriesDialog from "./AllEntriesDialog";
import EntriesDialog from "./EntriesDialog";
import ShortfallList from "./ShortfallList";
import ShortfallToolbar from "./ShortfallToolbar";
import ShortfallSummary from "./ShortfallSummary";

export function ShortfallDetail({ balance }) {
  const [view, setView] = useState("component");
  const [find, setFind] = useState(""); // filters the cards
  const [dialog, setDialog] = useState(null); // { kind: "entries", sku?, code?, all? } | { kind: "production" }
  const [dq, setDq] = useState(""); // search inside the "all entries" pop-up
  const sf = balance.shortfall;
  const missing = Math.abs(Number(balance.difference));
  const unexplained = Number(sf.unexplained);
  const inProduction = Number(sf.in_production);
  const explained = Number(sf.explained_total);
  const byComponent = view === "component";
  const capped = sf.movements.length >= 200;

  const status =
    unexplained === 0
      ? {
          tone: "success",
          pill: "Fully explained",
          sub: "Every missing piece has a recorded reason",
        }
      : unexplained > 0
        ? {
            tone: "danger",
            pill: `${fmtQty(unexplained)} unexplained`,
            sub: "Still to be traced to a stock-out",
          }
        : {
            tone: "warning",
            pill: `Over-explained by ${fmtQty(Math.abs(unexplained))}`,
            sub: "More was taken out than the shortfall",
          };

  // Drawing only: how the shortfall splits. The figures themselves come from the server.
  const segments = [
    {
      key: "prod",
      label: "Waiting in production",
      value: Math.max(inProduction, 0),
      bar: "bg-muted-foreground/45",
    },
    {
      key: "out",
      label: "Taken out with a reason",
      value: Math.max(explained, 0),
      bar: "bg-primary",
    },
    {
      key: "un",
      label: "Unexplained",
      value: Math.max(unexplained, 0),
      bar: "bg-destructive",
    },
  ];
  const segTotal = segments.reduce((s, x) => s + x.value, 0);

  const f = find.trim().toLowerCase();
  const comps = sf.components.filter(
    (c) => !f || `${c.name} ${c.sku}`.toLowerCase().includes(f),
  );
  const reasons = sf.by_reason.filter(
    (g) => !f || g.label.toLowerCase().includes(f),
  );

  // ---- pop-up content
  const open = (d) => {
    setDq("");
    setDialog(d);
  };
  let dTitle = "";
  let dDesc = "";
  let dRows = [];
  if (dialog?.kind === "entries") {
    const dc = dialog.sku
      ? sf.components.find((c) => c.sku === dialog.sku)
      : null;
    const dr = dialog.code
      ? sf.by_reason.find((g) => g.code === dialog.code)
      : null;
    dTitle = dc ? dc.name : dr ? dr.label : "All stock-out entries";
    const qq = dq.trim().toLowerCase();
    dRows = sf.movements.filter((m) => {
      if (dialog.sku && m.sku !== dialog.sku) return false;
      if (dialog.code && m.code !== dialog.code) return false;
      if (!qq) return true;
      return [
        m.component_name,
        m.sku,
        m.order_number,
        m.reason,
        m.reason_label,
        m.reference_no,
        m.recorded_by,
        m.worker_name,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(qq),
      );
    });
    dDesc = `${dc ? `${dc.sku} · ` : ""}${dRows.length} ${dRows.length === 1 ? "entry" : "entries"}${capped ? " · latest 200 stock-outs" : ""}`;
  }

  return (
    <div>
      {/* ------------------------------------------------------------ summary */}
      <ShortfallSummary balance={balance} explained={explained} inProduction={inProduction} missing={missing} open={open} segments={segments} segTotal={segTotal} status={status} unexplained={unexplained} />

      {/* ------------------------------------------------------------ toolbar */}
      <ShortfallToolbar byComponent={byComponent} find={find} open={open} setFind={setFind} setView={setView} sf={sf} view={view} />

      {/* ------------------------------------------------------------ cards */}
      <ShortfallList byComponent={byComponent} comps={comps} find={find} open={open} reasons={reasons} sf={sf} />

      {/* ------------------------------------------------------------ pop-ups */}
      <EntriesDialog dDesc={dDesc} dialog={dialog} dq={dq} dRows={dRows} dTitle={dTitle} setDialog={setDialog} setDq={setDq} />

      <AllEntriesDialog dialog={dialog} inProduction={inProduction} setDialog={setDialog} sf={sf} />
    </div>
  );
}

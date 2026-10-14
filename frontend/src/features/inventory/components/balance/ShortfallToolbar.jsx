import { Segmented } from "./Segmented";
import { fmtQty } from "@/lib/stock";
import { SearchBox } from "./SearchBox";
import { CfButton } from "@/components/HistoryUI";
import { ClipboardList } from "lucide-react";

export default function ShortfallToolbar({
  byComponent,
  find,
  open,
  setFind,
  setView,
  sf,
  view,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-cf-head px-[18px] py-2.5">
      <Segmented
        label="Break down by"
        value={view}
        onChange={(k) => {
          setView(k);
          setFind("");
        }}
        options={[
          ["component", "By component"],
          ["reason", "By reason"],
        ]}
      />
      <p className="hidden text-[11px] text-muted-foreground md:block">
        {byComponent
          ? `${sf.components.length} components · ${fmtQty(sf.components_missing_total)} missing in total`
          : `${sf.by_reason.length} reasons`}
      </p>
      <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
        <SearchBox
          value={find}
          onChange={setFind}
          placeholder={byComponent ? "Search components…" : "Search reasons…"}
          className="min-w-0 flex-1 sm:w-60 sm:flex-none"
        />
        <CfButton
          variant="secondary"
          onClick={() => open({ kind: "entries", all: true })}
          disabled={sf.movements.length === 0}
        >
          <ClipboardList /> All entries
        </CfButton>
      </div>
    </div>
  );
}

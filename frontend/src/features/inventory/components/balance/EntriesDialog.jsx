import { Modal } from "@/components/Modal";
import { CfButton } from "@/components/HistoryUI";
import { SearchBox } from "./SearchBox";
import { EntriesTable } from "./EntriesTable";

export default function EntriesDialog({
  dDesc,
  dialog,
  dq,
  dRows,
  dTitle,
  setDialog,
  setDq,
}) {
  return (
    <Modal
      open={dialog?.kind === "entries"}
      onClose={() => setDialog(null)}
      size="xl"
      className="cf-scope"
      title={dTitle}
      description={dDesc}
      footer={
        <CfButton variant="secondary" onClick={() => setDialog(null)}>
          Close
        </CfButton>
      }
    >
      <div className="-mx-5 -my-5">
        {dialog?.all && (
          <div className="border-b bg-cf-head px-[18px] py-2.5">
            <SearchBox
              value={dq}
              onChange={setDq}
              placeholder="Search component, order, reason…"
            />
          </div>
        )}
        {dRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {dq
              ? "No entries match your search."
              : "No stock-out entries recorded for this selection."}
          </p>
        ) : (
          <div className="max-h-[calc(100dvh-17rem)] overflow-auto">
            <EntriesTable
              rows={dRows}
              showComponent={!dialog?.sku}
              showReason={!dialog?.code}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

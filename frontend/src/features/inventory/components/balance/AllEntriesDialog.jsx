import { Modal } from "@/components/Modal";
import { fmtQty } from "@/lib/stock";
import { CfButton } from "@/components/HistoryUI";

export default function AllEntriesDialog({
  dialog,
  inProduction,
  setDialog,
  sf,
}) {
  return (
    <Modal
      open={dialog?.kind === "production"}
      onClose={() => setDialog(null)}
      size="md"
      className="cf-scope"
      title="Waiting in production"
      description={`${fmtQty(inProduction)} components · not missing`}
      footer={
        <CfButton variant="secondary" onClick={() => setDialog(null)}>
          Close
        </CfButton>
      }
    >
      <div className="-mx-5 -my-5">
        <p className="border-b bg-cf-head px-[18px] py-3 text-[11px] leading-5 text-muted-foreground">
          Production is complete, but these products have not reached finished
          goods yet (testing / quality control).
        </p>
        {sf.unfinished_components.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No products are waiting between production and finished goods.
          </p>
        ) : (
          <ul className="divide-y">
            {sf.unfinished_components.map((c) => (
              <li
                key={c.component_id}
                className="flex items-center justify-between gap-3 px-[18px] py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-[10px] text-cf-faint">{c.sku}</p>
                </div>
                <p className="whitespace-nowrap text-xs font-bold tabular-nums">
                  {fmtQty(c.quantity)}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {c.unit}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

import { ConfirmDialog } from "@/components/Modal"
import { longDate } from "@/lib/format"

export default function ConfirmMarkDialog({
  confirm,
  confirmBusy,
  confirmMeta,
  date,
  runConfirm,
  setConfirm,
}) {
  return (
    <ConfirmDialog
      open={!!confirm}
      onClose={() => { if (!confirmBusy) setConfirm(null) }}
      onConfirm={runConfirm}
      busy={confirmBusy}
      tone={confirmMeta?.tone}
      title={confirmMeta?.title ?? ""}
      confirmLabel={confirmMeta?.label}
    >
      {confirm && <p>{confirmMeta.body(confirm.employee.name, longDate(date))}</p>}
    </ConfirmDialog>
  )
}

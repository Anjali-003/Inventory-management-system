import { ConfirmDialog } from "@/components/Modal";
import { Button } from "@/components/ui/button";

export default function DeleteEmployeeDialog({
  deleting,
  doDelete,
  setActive,
  setToDelete,
  toDelete,
}) {
  return (
    <ConfirmDialog
      open={!!toDelete}
      onClose={() => {
        if (!deleting) setToDelete(null);
      }}
      onConfirm={doDelete}
      busy={deleting}
      tone="danger"
      title={`Delete ${toDelete?.name ?? "employee"}?`}
      confirmLabel="Delete employee"
      extra={
        toDelete?.is_active ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={deleting}
            onClick={() => {
              const t = toDelete;
              setToDelete(null);
              setActive(t, false);
            }}
            className="sm:mr-auto"
          >
            Deactivate instead
          </Button>
        ) : null
      }
    >
      <p>
        This permanently removes the employee and all of their attendance
        records. It can't be undone.
      </p>
      <p>
        To keep their history, deactivate them instead. They're hidden from
        the attendance sheet and reports, but their records are kept.
      </p>
    </ConfirmDialog>
  );
}

import { Accordion } from "@/components/ui/accordion";

export function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-b py-3 last:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="min-w-0 break-words text-sm font-medium">
        {value || "Not provided"}
      </p>
    </div>
  );
}

/* A titled block that can be folded away; open by default. */
export function DetailSection({ title, children, defaultOpen = true }) {
  return (
    <Accordion
      as="section"
      defaultOpen={defaultOpen}
      headerClassName="mb-2 rounded-md px-1 py-1"
      header={
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      }
    >
      <div className="rounded-xl border bg-card px-4">{children}</div>
    </Accordion>
  );
}

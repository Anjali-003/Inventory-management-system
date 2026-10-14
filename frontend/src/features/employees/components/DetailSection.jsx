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

export function DetailSection({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-xl border bg-card px-4">{children}</div>
    </section>
  );
}

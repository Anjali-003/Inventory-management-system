import StatStrip from "@/components/StatStrip";

export default function EmployeeStats({
  setStatus,
  stats,
  status,
}) {
  return (
    <StatStrip
      dropdown="Filter employees by status"
      layoutId="emp-stat"
      cols="grid-cols-2 lg:grid-cols-4"
      items={[
        {
          key: "all",
          label: "Total employees",
          value: stats.total,
          tone: "neutral",
          active: status === "all",
          onClick: () => setStatus("all"),
        },
        {
          key: "active",
          label: "Active",
          value: stats.active,
          tone: "success",
          active: status === "active",
          onClick: () => setStatus(status === "active" ? "all" : "active"),
        },
        {
          key: "inactive",
          label: "Inactive",
          value: stats.inactive,
          tone: "danger",
          active: status === "inactive",
          onClick: () =>
            setStatus(status === "inactive" ? "all" : "inactive"),
        },
        {
          key: "depts",
          label: "Departments",
          value: stats.departments,
          tone: "info",
          onClick: () => {
            const el = document.querySelector('select[aria-label="Filter by department"]');
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
            try { el.showPicker?.(); } catch { /* not allowed here, focus is enough */ }
          },
        },
      ]}
    />
  );
}

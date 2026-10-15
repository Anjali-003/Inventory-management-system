import { Link } from "react-router-dom"
import { StatCard } from "@/components/HistoryUI"

/** A clickable metric that reuses the application's standard dashboard card style. */
export default function DashboardMetricCard({ to, label, value, detail, icon, tone = "green", loading, index = 0 }) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${loading ? "loading" : value}. Open related page.`}
      className="block rounded-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <StatCard
        index={index}
        icon={icon}
        tone={tone}
        label={label}
        value={value}
        loading={loading}
        detail={detail}
      />
    </Link>
  )
}

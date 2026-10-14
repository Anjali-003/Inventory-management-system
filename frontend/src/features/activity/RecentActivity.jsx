import { Link } from "react-router-dom"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetActivityQuery } from "./activityApi"
import ActivityFeed from "./ActivityFeed"

/* Small card for the dashboard: the latest few actions by any super admin. */
export default function RecentActivity({ limit = 6 }) {
  const { data: me } = useGetMeQuery()
  const { data = [], isLoading } = useGetActivityQuery({ limit })

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>What the other super admins (and you) did lately.</CardDescription>
        </div>
        <Link to="/activity" className="text-sm font-medium text-primary hover:underline">View all</Link>
      </CardHeader>
      {isLoading ? <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p> : <ActivityFeed items={data} meId={me?.id} />}
    </Card>
  )
}

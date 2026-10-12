import { useState } from "react"
import PageHeader from "@/components/PageHeader"
import { Notice, TableSkeleton } from "@/components/feedback"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useGetMeQuery } from "@/features/auth/authApi"
import { useGetActivityQuery } from "./activityApi"
import ActivityFeed from "./ActivityFeed"

const STEP = 30
const MAX = 200

export default function Activity() {
  const [limit, setLimit] = useState(STEP)
  const { data: me } = useGetMeQuery()
  // `data` keeps showing the previous result while a bigger page loads, so the list doesn't flash
  const { data = [], isLoading, isFetching, error } = useGetActivityQuery({ limit })

  return (
    <>
      <PageHeader title="Activity" description="What every super admin did, newest first. Updates live." />
      {error && <div className="mb-6"><Notice title="Something went wrong">Could not load activity.</Notice></div>}

      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton rows={6} /> : <ActivityFeed items={data} meId={me?.id} />}
      </Card>

      {data.length >= limit && limit < MAX && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={isFetching} onClick={() => setLimit((n) => Math.min(n + STEP, MAX))}>
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  )
}

import { Factory } from "lucide-react"
import PageHeader from "../components/PageHeader"
import { EmptyState } from "../components/feedback"
import { Card } from "../components/ui/card"

export default function Production() {
  return (
    <>
      <PageHeader title="Production" description="Start and track production runs." />
      <Card>
        <EmptyState icon={Factory} title="No production runs yet">
          Orders that are ready for production will be started from this page.
        </EmptyState>
      </Card>
    </>
  )
}

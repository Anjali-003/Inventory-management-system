import { useEffect, useState } from "react"
import { Factory, Loader2 } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, OrderStatus, TableSkeleton } from "../components/feedback"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

const formatDate = (value) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-"

export default function Production() {
  const [productionOrders, setProductionOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [completing, setCompleting] = useState(null)

  const fetchProductionOrders = async () => {
    try {
      const response = await api.get("/production")
      setProductionOrders(response.data)
      setError("")
    } catch (err) {
      console.error(err)
      setError("Failed to load production orders. Check that the server is running.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProductionOrders()
  }, [])

  const handleComplete = async (productionId) => {
    try {
      setCompleting(productionId)
      await api.post(`/production/${productionId}/complete`)
      await fetchProductionOrders()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || "Failed to complete production")
    } finally {
      setCompleting(null)
    }
  }

  return (
    <>
      <PageHeader title="Production" description="Track orders currently in production and mark them complete." />
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : productionOrders.length === 0 ? (
          <EmptyState icon={Factory} title="No production runs yet">
            Orders started from the Orders page will be tracked here.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productionOrders.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums text-muted-foreground">#{p.id}</TableCell>
                  <TableCell className="font-medium tabular-nums">{p.order_number}</TableCell>
                  <TableCell><OrderStatus status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.started_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.completed_at)}</TableCell>
                  <TableCell className="text-right">
                    {p.status === "IN_PRODUCTION" && (
                      <Button size="sm" disabled={completing === p.id} onClick={() => handleComplete(p.id)}>
                        {completing === p.id && <Loader2 className="animate-spin" />}
                        Mark complete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}

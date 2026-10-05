import { useEffect, useState } from "react"
import { Factory, Loader2 } from "lucide-react"

import api from "../api/api"

import PageHeader from "../components/PageHeader"

import { EmptyState, Notice, OrderStatus, TableSkeleton } from "../components/feedback"

import { Button } from "../components/ui/button"

import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

import { Input, Label } from "../components/ui/input"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-"

export default function Production() {
  const [productionOrders, setProductionOrders] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  /*
  =========================================================
  UPDATE PRODUCTION MODAL
  =========================================================
  */

  const [selectedProduction, setSelectedProduction] = useState(null)

  const [completedQuantity, setCompletedQuantity] = useState(1)

  const [updating, setUpdating] = useState(false)

  /*
  =========================================================
  FETCH PRODUCTION ORDERS
  =========================================================
  */

  const fetchProductionOrders = async () => {
    try {
      setLoading(true)

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

  /*
  =========================================================
  OPEN UPDATE MODAL
  =========================================================
  */

  const openUpdateProduction = (production) => {
    const started = Number(production.quantity_to_produce)

    const completed = Number(production.quantity_completed)

    const remaining = Math.max(0, started - completed)

    setSelectedProduction(production)

    setCompletedQuantity(remaining > 0 ? 1 : 0)
  }

  /*
  =========================================================
  CLOSE UPDATE MODAL
  =========================================================
  */

  const closeUpdateProduction = () => {
    setSelectedProduction(null)

    setCompletedQuantity(1)
  }

  /*
  =========================================================
  UPDATE PRODUCTION
  =========================================================

  Example:

  Current completed = 20

  User enters = 10

  New completed = 30
  */

  const handleUpdateProduction = async () => {
    if (!selectedProduction) {
      return
    }

    const quantity = Number(completedQuantity)

    const started = Number(selectedProduction.quantity_to_produce)

    const completed = Number(selectedProduction.quantity_completed)

    const remaining = Math.max(0, started - completed)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Enter a valid completed quantity.")

      return
    }

    if (quantity > remaining) {
      setError(`You can complete at most ${remaining} currently started product(s).`)

      return
    }

    try {
      setUpdating(true)

      setError("")

      await api.post(`/production/${selectedProduction.id}/update-progress`, {
        quantity,
      })

      closeUpdateProduction()

      await fetchProductionOrders()
    } catch (err) {
      console.error(err)

      setError(err.response?.data?.message || "Failed to update production")
    } finally {
      setUpdating(false)
    }
  }

  /*
  =========================================================
  PAGE
  =========================================================
  */

  return (
    <>
      <PageHeader title="Production" description="Track production progress and record completed products." />

      {error && (
        <div className="mb-6">
          <Notice title="Something went wrong">{error}</Notice>
        </div>
      )}

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

                <TableHead>Product</TableHead>

                <TableHead>Progress</TableHead>

                <TableHead>Status</TableHead>

                <TableHead>Started</TableHead>

                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {productionOrders.map((p) => {
                const ordered = Number(p.ordered_quantity)

                const started = Number(p.quantity_to_produce)

                const completed = Number(p.quantity_completed)

                const inProduction = Math.max(0, started - completed)

                /*
                    IMPORTANT:

                    Progress is based on
                    the full customer order.

                    Example:

                    Completed = 20
                    Ordered = 100

                    Progress = 20%
                  */
                const progress = ordered > 0 ? Math.min(100, Math.round((completed / ordered) * 100)) : 0

                return (
                  <TableRow key={p.id}>
                    {/* RUN */}

                    <TableCell className="tabular-nums text-muted-foreground">#{p.id}</TableCell>

                    {/* ORDER */}

                    <TableCell className="font-medium tabular-nums">{p.order_number}</TableCell>

                    {/* PRODUCT */}

                    <TableCell>{p.product_name || "-"}</TableCell>

                    {/* PROGRESS */}

                    <TableCell className="min-w-[260px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium tabular-nums">
                            {completed} / {ordered}
                          </span>

                          <span className="text-sm text-muted-foreground tabular-nums">{progress}%</span>
                        </div>

                        {/* PROGRESS BAR */}

                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{
                              width: `${progress}%`,
                            }}
                          />
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Started: {started}
                          {" • "}
                          In production: {inProduction}
                        </div>
                      </div>
                    </TableCell>

                    {/* STATUS */}

                    <TableCell>
                      <OrderStatus status={p.status} />
                    </TableCell>

                    {/* STARTED */}

                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(p.started_at)}
                    </TableCell>

                    {/* ACTION */}

                    <TableCell className="text-right">
                      {p.status === "IN_PRODUCTION" && inProduction > 0 ? (
                        <Button size="sm" onClick={() => openUpdateProduction(p)}>
                          Update Production
                        </Button>
                      ) : p.status === "COMPLETED" ? (
                        <span className="text-sm text-muted-foreground">Completed</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Start more from Orders</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* =====================================================
          UPDATE PRODUCTION MODAL
      ====================================================== */}

      {selectedProduction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeUpdateProduction()
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-background shadow-2xl">
            {/* HEADER */}

            <div className="border-b p-6">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                PRODUCTION UPDATE
              </p>

              <h2 className="text-2xl font-semibold">Update Production</h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Record how many products were completed in this update.
              </p>
            </div>

            <div className="space-y-6 p-6">
              {/* ORDER INFO */}

              <div className="rounded-xl border bg-muted/30 p-5">
                <p className="text-sm text-muted-foreground">Order</p>

                <h3 className="mt-1 text-xl font-semibold">{selectedProduction.order_number}</h3>

                <p className="mt-1 text-sm text-muted-foreground">{selectedProduction.product_name}</p>
              </div>

              {/* STATISTICS */}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Ordered</p>

                  <p className="mt-1 text-lg font-semibold">{selectedProduction.ordered_quantity}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Completed</p>

                  <p className="mt-1 text-lg font-semibold">{selectedProduction.quantity_completed}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Started</p>

                  <p className="mt-1 text-lg font-semibold">{selectedProduction.quantity_to_produce}</p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">In Production</p>

                  <p className="mt-1 text-lg font-semibold">
                    {Math.max(
                      0,
                      Number(selectedProduction.quantity_to_produce) -
                        Number(selectedProduction.quantity_completed)
                    )}
                  </p>
                </div>
              </div>

              {/* INPUT */}

              <div>
                <Label htmlFor="completed-quantity">Products completed in this update</Label>

                <Input
                  id="completed-quantity"
                  type="number"
                  min="1"
                  max={Math.max(
                    0,
                    Number(selectedProduction.quantity_to_produce) -
                      Number(selectedProduction.quantity_completed)
                  )}
                  value={completedQuantity}
                  onChange={(e) => setCompletedQuantity(Number(e.target.value))}
                />

                <p className="mt-2 text-xs text-muted-foreground">
                  Maximum you can complete right now:{" "}
                  {Math.max(
                    0,
                    Number(selectedProduction.quantity_to_produce) -
                      Number(selectedProduction.quantity_completed)
                  )}
                </p>
              </div>

              {/* BUTTON */}

              <div className="flex justify-end border-t pt-5">
                <Button onClick={handleUpdateProduction} disabled={updating || completedQuantity <= 0}>
                  {updating && <Loader2 className="animate-spin" />}

                  {updating ? "Saving..." : "Save Production"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

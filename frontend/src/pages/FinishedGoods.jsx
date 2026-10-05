import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, PackageCheck, Truck, RefreshCw, X } from "lucide-react"

import api from "../api/api"

import SearchBar from "../components/SearchBar"
import PageHeader from "../components/PageHeader"

import { Button } from "../components/ui/button"

import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

import { Badge } from "../components/ui/badge"

import { Notice, EmptyState, TableSkeleton } from "../components/feedback"

/*
=========================================================
STATUS LABELS
=========================================================
*/

const STATUS_LABELS = {
  PACKAGING: "Packaging",
  DISPATCHED: "Dispatched",
  COMPLETED: "Completed",
}

/*
=========================================================
STATUS BADGE
=========================================================
*/

function FinishedGoodsStatus({ status }) {
  const config = {
    PACKAGING: {
      variant: "warning",
      label: "Packaging",
    },

    DISPATCHED: {
      variant: "success",
      label: "Dispatched",
    },

    COMPLETED: {
      variant: "neutral",
      label: "Completed",
    },
  }

  const current = config[status] || {
    variant: "neutral",
    label:
      STATUS_LABELS[status] ||
      String(status || "Unknown")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
  }

  return <Badge variant={current.variant}>{current.label}</Badge>
}

/*
=========================================================
CONFIRMATION MODAL
=========================================================
*/

function ConfirmationModal({ open, title, description, confirmText, loading, onConfirm, onClose }) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>

          <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={loading}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>

          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? "Updating..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

/*
=========================================================
MAIN COMPONENT
=========================================================
*/

export default function FinishedGoods() {
  /*
  =======================================================
  FINISHED GOODS DATA
  =======================================================
  */

  const [finishedGoods, setFinishedGoods] = useState([])

  /*
  =======================================================
  LOADING
  =======================================================
  */

  const [loading, setLoading] = useState(true)

  /*
  =======================================================
  ERROR
  =======================================================
  */

  const [error, setError] = useState("")

  /*
  =======================================================
  SUCCESS MESSAGE
  =======================================================
  */

  const [message, setMessage] = useState("")

  /*
  =======================================================
  SEARCH
  =======================================================
  */

  const [search, setSearch] = useState("")

  /*
  =======================================================
  SELECTED ITEM
  =======================================================
  */

  const [selectedItem, setSelectedItem] = useState(null)

  /*
  =======================================================
  ACTION TYPE
  =======================================================
  */

  const [actionType, setActionType] = useState(null)

  /*
  =======================================================
  ACTION LOADING
  =======================================================
  */

  const [actionLoading, setActionLoading] = useState(false)

  /*
  =======================================================
  FETCH FINISHED GOODS
  =======================================================
  */

  const fetchFinishedGoods = async () => {
    try {
      setLoading(true)

      setError("")

      const response = await api.get("/finished-goods")

      setFinishedGoods(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      console.error("Failed to fetch finished goods:", err)

      setError(err.response?.data?.message || "Failed to load finished goods.")
    } finally {
      setLoading(false)
    }
  }

  /*
  =======================================================
  INITIAL LOAD
  =======================================================
  */

  useEffect(() => {
    fetchFinishedGoods()
  }, [])

  /*
  =======================================================
  FILTER RESULTS
  =======================================================
  */

  const filteredFinishedGoods = useMemo(() => {
    const searchText = search.trim().toLowerCase()

    if (!searchText) {
      return finishedGoods
    }

    return finishedGoods.filter((item) => {
      return (
        String(item.orderNumber || "")
          .toLowerCase()
          .includes(searchText) ||
        String(item.productName || "")
          .toLowerCase()
          .includes(searchText) ||
        String(item.productSku || "")
          .toLowerCase()
          .includes(searchText) ||
        String(item.status || "")
          .toLowerCase()
          .includes(searchText)
      )
    })
  }, [finishedGoods, search])

  /*
  =======================================================
  SUMMARY COUNTS
  =======================================================
  */

  const summary = useMemo(() => {
    const packaging = finishedGoods.filter((item) => item.status === "PACKAGING").length

    const dispatched = finishedGoods.filter((item) => item.status === "DISPATCHED").length

    const completed = finishedGoods.filter((item) => item.status === "COMPLETED").length

    return {
      total: finishedGoods.length,
      packaging,
      dispatched,
      completed,
    }
  }, [finishedGoods])

  /*
  =======================================================
  OPEN ACTION
  =======================================================
  */

  const openAction = (item, type) => {
    setSelectedItem(item)

    setActionType(type)

    setMessage("")

    setError("")
  }

  /*
  =======================================================
  CLOSE ACTION
  =======================================================
  */

  const closeAction = () => {
    if (actionLoading) {
      return
    }

    setSelectedItem(null)

    setActionType(null)
  }

  /*
  =======================================================
  PERFORM ACTION
  =======================================================
  */

  const handleAction = async () => {
    if (!selectedItem || !actionType) {
      return
    }

    try {
      setActionLoading(true)

      setMessage("")

      setError("")

      /*
      -------------------------------------------------
      MARK DISPATCHED
      -------------------------------------------------
      */

      if (actionType === "DISPATCH") {
        await api.post(`/finished-goods/${selectedItem.id}/dispatch`)

        setMessage(`Order ${selectedItem.orderNumber} marked as dispatched.`)
      }

      /*
      -------------------------------------------------
      MARK COMPLETED
      -------------------------------------------------
      */

      if (actionType === "COMPLETE") {
        await api.post(`/finished-goods/${selectedItem.id}/complete`)

        setMessage(`Order ${selectedItem.orderNumber} marked as completed.`)
      }

      /*
      -------------------------------------------------
      REFRESH
      -------------------------------------------------
      */

      await fetchFinishedGoods()

      /*
      -------------------------------------------------
      CLOSE MODAL
      -------------------------------------------------
      */

      setSelectedItem(null)

      setActionType(null)
    } catch (err) {
      console.error("Failed to update finished goods:", err)

      setError(err.response?.data?.message || "Failed to update finished goods status.")
    } finally {
      setActionLoading(false)
    }
  }

  /*
  =======================================================
  ACTION MODAL DETAILS
  =======================================================
  */

  const getActionDetails = () => {
    if (actionType === "DISPATCH") {
      return {
        title: "Mark as Dispatched",

        description: `Are you sure you want to mark ${selectedItem?.orderNumber || "this order"} as dispatched?`,

        confirmText: "Mark Dispatched",
      }
    }

    if (actionType === "COMPLETE") {
      return {
        title: "Mark as Completed",

        description: `Are you sure you want to mark ${selectedItem?.orderNumber || "this order"} as completed?`,

        confirmText: "Mark Completed",
      }
    }

    return null
  }

  const actionDetails = getActionDetails()

  /*
  =======================================================
  RENDER
  =======================================================
  */

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Finished Goods"
        description="Manage products that have passed quality control and are ready for packaging, dispatch, and completion."
      />

      {/* SUCCESS MESSAGE */}

      {message && (
        <Notice tone="success" title="Success">
          {message}
        </Notice>
      )}

      {/* ERROR MESSAGE */}

      {error && (
        <Notice tone="error" title="Error">
          {error}
        </Notice>
      )}

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* TOTAL */}

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
              <PackageCheck className="size-5" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Total</p>

              <p className="text-2xl font-semibold">{summary.total}</p>
            </div>
          </CardContent>
        </Card>

        {/* PACKAGING */}

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
              <PackageCheck className="size-5" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Packaging</p>

              <p className="text-2xl font-semibold">{summary.packaging}</p>
            </div>
          </CardContent>
        </Card>

        {/* DISPATCHED */}

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
              <Truck className="size-5" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Dispatched</p>

              <p className="text-2xl font-semibold">{summary.dispatched}</p>
            </div>
          </CardContent>
        </Card>

        {/* COMPLETED */}

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
              <CheckCircle2 className="size-5" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Completed</p>

              <p className="text-2xl font-semibold">{summary.completed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MAIN TABLE */}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Finished Goods</CardTitle>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <div className="min-w-0 sm:min-w-[280px]">
                <SearchBar value={search} onChange={setSearch} placeholder="Search order, product, SKU..." />
              </div>

              <Button type="button" variant="outline" onClick={fetchFinishedGoods} disabled={loading}>
                <RefreshCw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} />
          ) : filteredFinishedGoods.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No finished goods found">
              Products that pass quality control will appear here.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>

                    <TableHead>Product</TableHead>

                    <TableHead>SKU</TableHead>

                    <TableHead>Quantity</TableHead>

                    <TableHead>Status</TableHead>

                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredFinishedGoods.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.orderNumber || "-"}</TableCell>

                      <TableCell>{item.productName || "-"}</TableCell>

                      <TableCell>{item.productSku || "-"}</TableCell>

                      <TableCell>{item.quantity ?? 0}</TableCell>

                      <TableCell>
                        <FinishedGoodsStatus status={item.status} />
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {item.status === "PACKAGING" && (
                            <Button type="button" size="sm" onClick={() => openAction(item, "DISPATCH")}>
                              <Truck className="mr-2 size-4" />
                              Mark Dispatched
                            </Button>
                          )}

                          {item.status === "DISPATCHED" && (
                            <Button type="button" size="sm" onClick={() => openAction(item, "COMPLETE")}>
                              <CheckCircle2 className="mr-2 size-4" />
                              Mark Completed
                            </Button>
                          )}

                          {item.status === "COMPLETED" && (
                            <span className="text-sm text-muted-foreground">No action</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CONFIRMATION MODAL */}

      <ConfirmationModal
        open={Boolean(selectedItem && actionType)}
        title={actionDetails?.title || ""}
        description={actionDetails?.description || ""}
        confirmText={actionDetails?.confirmText || "Confirm"}
        loading={actionLoading}
        onConfirm={handleAction}
        onClose={closeAction}
      />
    </div>
  )
}

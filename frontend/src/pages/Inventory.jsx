import { useEffect, useMemo, useState } from "react"
import { Search, Warehouse } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, TableSkeleton } from "../components/feedback"
import { Badge } from "../components/ui/badge"
import { Card } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

export default function Inventory() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    api
      .get("/inventory")
      .then((r) => setInventory(r.data))
      .catch((err) => {
        console.error(err)
        setError("Could not load inventory. Check that the server is running.")
      })
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? inventory.filter((i) => `${i.sku} ${i.component_name}`.toLowerCase().includes(q)) : inventory
  }, [inventory, query])

  return (
    <>
      <PageHeader title="Inventory" description="Raw material stock: on hand, reserved for production, and available.">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by SKU or name"
            aria-label="Search components"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </PageHeader>
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Warehouse} title={query ? "No matching components" : "No inventory yet"}>
            {query ? "Try a different SKU or component name." : "Components with stock records will appear here."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Minimum</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const avail = Number(item.available)
                const min = Number(item.minimum_stock_level)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{item.sku}</TableCell>
                    <TableCell className="font-medium">{item.component_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity_on_hand}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{item.quantity_reserved}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{avail}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{min}</TableCell>
                    <TableCell>
                      {avail <= 0 ? <Badge variant="danger">Out of stock</Badge>
                        : avail <= min ? <Badge variant="warning">Low</Badge>
                        : <Badge variant="success">In stock</Badge>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  )
}

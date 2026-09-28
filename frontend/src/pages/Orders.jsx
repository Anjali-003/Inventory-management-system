import { useEffect, useState } from "react"
import { ClipboardList, Loader2 } from "lucide-react"
import api from "../api/api"
import PageHeader from "../components/PageHeader"
import { EmptyState, Notice, OrderStatus } from "../components/feedback"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input, Label, Select } from "../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"
import { cn } from "../lib/utils"

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [creating, setCreating] = useState(false)
  const [checking, setChecking] = useState(null)
  const [checkedOrder, setCheckedOrder] = useState(null)
  const [materialCheck, setMaterialCheck] = useState(null)
  const [message, setMessage] = useState(null)

  const fetchOrders = () => api.get("/orders").then((r) => setOrders(r.data)).catch(console.error)

  useEffect(() => {
    fetchOrders()
    api.get("/products").then((r) => setProducts(r.data)).catch(console.error)
  }, [])

  const runMaterialCheck = async (orderId, orderNumber) => {
    try {
      setChecking(orderId)
      const r = await api.get(`/orders/${orderId}/material-check`)
      setCheckedOrder({ orderId, orderNumber })
      setMaterialCheck(r.data)
    } catch (err) {
      console.error(err)
      setMessage({ tone: "error", text: "Failed to check materials" })
    } finally {
      setChecking(null)
    }
  }

  const handleCreateOrder = async (e) => {
    e.preventDefault()
    setMessage(null)
    if (!selectedProduct) return setMessage({ tone: "error", text: "Please select a product" })
    if (quantity <= 0) return setMessage({ tone: "error", text: "Quantity must be greater than 0" })

    try {
      setCreating(true)
      const r = await api.post("/orders", { items: [{ productId: Number(selectedProduct), quantity }] })
      setMessage({ tone: "success", text: `Order ${r.data.orderNumber} created` })
      await fetchOrders()
      await runMaterialCheck(r.data.orderId, r.data.orderNumber)
    } catch (err) {
      console.error(err)
      setMessage({ tone: "error", text: "Failed to create order" })
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PageHeader title="Orders" description="Create manufacturing orders and check whether materials cover them." />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>New order</CardTitle>
              <CardDescription>Materials are checked as soon as the order is created.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <Label htmlFor="product">Product</Label>
                <Select id="product" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                  <option value="">Select a product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </div>
              {message && <Notice tone={message.tone}>{message.text}</Notice>}
              <Button type="submit" size="lg" className="w-full" disabled={creating}>
                {creating && <Loader2 className="animate-spin" />}
                {creating ? "Creating order" : "Create order"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Existing orders</CardTitle>
          </CardHeader>
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No orders yet">Create your first order to see it here.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={`${o.id}-${o.product_id}`} data-active={checkedOrder?.orderId === o.id}>
                    <TableCell className="font-medium tabular-nums">{o.order_number}</TableCell>
                    <TableCell>{o.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.quantity}</TableCell>
                    <TableCell><OrderStatus status={o.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" disabled={checking === o.id} onClick={() => runMaterialCheck(o.id, o.order_number)}>
                        {checking === o.id && <Loader2 className="animate-spin" />}
                        Check materials
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {materialCheck && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Material availability</CardTitle>
              <CardDescription>{checkedOrder?.orderNumber}</CardDescription>
            </div>
            <Badge variant={materialCheck.canProduce ? "success" : "danger"}>
              {materialCheck.canProduce ? "Ready for production" : "Material shortage"}
            </Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Shortage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materialCheck.materials.map((m) => {
                const short = Number(m.shortage) > 0
                return (
                  <TableRow key={m.componentId}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.required}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.available}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", short && "font-medium text-destructive")}>{m.shortage}</TableCell>
                    <TableCell><Badge variant={short ? "danger" : "success"}>{short ? "Short" : "Covered"}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}

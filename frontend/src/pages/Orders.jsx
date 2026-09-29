
import { useEffect, useState } from "react";
import { ClipboardList, Loader2, Plus, X } from "lucide-react";

import api from "../api/api";
import SearchBar from "../components/SearchBar";
import PageHeader from "../components/PageHeader";
import { EmptyState, Notice, OrderStatus } from "../components/feedback";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input, Label, Select } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { cn } from "../lib/utils";

export default function Orders() {
  // =========================================================
  // DATA
  // =========================================================

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);

  // Search
  const [search, setSearch] = useState("");

  // Create order modal
  const [isCreateOrderOpen, setIsCreateOrderOpen] =
    useState(false);

  // Create order form
  const [selectedProduct, setSelectedProduct] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  // Loading states
  const [creating, setCreating] =
    useState(false);

  const [checking, setChecking] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  // Material check
  const [checkedOrder, setCheckedOrder] =
    useState(null);

  const [materialCheck, setMaterialCheck] =
    useState(null);

  // Messages
  const [message, setMessage] =
    useState(null);


  // =========================================================
  // FETCH DATA
  // =========================================================

  const fetchOrders = async () => {
    try {
      const response = await api.get("/orders");

      setOrders(response.data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);

      setMessage({
        tone: "error",
        text: "Failed to load orders",
      });
    }
  };


  const fetchProducts = async () => {
    try {
      const response = await api.get("/products");

      setProducts(response.data);
    } catch (error) {
      console.error(
        "Failed to fetch products:",
        error
      );

      setMessage({
        tone: "error",
        text: "Failed to load products",
      });
    }
  };


  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, []);


  // =========================================================
  // SEARCH
  // =========================================================

  const filteredOrders = orders.filter((order) => {
    const searchText = search.toLowerCase();

    return (
      (order.order_number || "")
        .toLowerCase()
        .includes(searchText) ||

      (order.product_name || "")
        .toLowerCase()
        .includes(searchText) ||

      (order.status || "")
        .toLowerCase()
        .includes(searchText)
    );
  });


  // =========================================================
  // MATERIAL CHECK
  // =========================================================

  const runMaterialCheck = async (
    orderId,
    orderNumber
  ) => {
    try {
      setChecking(orderId);
      setMessage(null);

      const response = await api.get(
        `/orders/${orderId}/material-check`
      );

      setCheckedOrder({
        orderId,
        orderNumber,
      });

      setMaterialCheck(response.data);
    } catch (error) {
      console.error(error);

      setMessage({
        tone: "error",
        text: "Failed to check materials",
      });
    } finally {
      setChecking(null);
    }
  };


  // =========================================================
  // CREATE ORDER
  // =========================================================

  const handleCreateOrder = async (e) => {
    e.preventDefault();

    setMessage(null);

    if (!selectedProduct) {
      setMessage({
        tone: "error",
        text: "Please select a product",
      });

      return;
    }

    if (!quantity || quantity <= 0) {
      setMessage({
        tone: "error",
        text: "Quantity must be greater than 0",
      });

      return;
    }


    try {
      setCreating(true);

      const response = await api.post(
        "/orders",
        {
          items: [
            {
              productId: Number(selectedProduct),
              quantity: Number(quantity),
            },
          ],
        }
      );


      setMessage({
        tone: "success",
        text: `Order ${response.data.orderNumber} created`,
      });


      // Refresh existing orders table
      await fetchOrders();


      /*
        Automatically check materials
        for the new order.
      */
      await runMaterialCheck(
        response.data.orderId,
        response.data.orderNumber
      );


    } catch (error) {
      console.error(error);

      setMessage({
        tone: "error",
        text:
          error.response?.data?.message ||
          "Failed to create order",
      });
    } finally {
      setCreating(false);
    }
  };


  // =========================================================
  // START PRODUCTION
  // =========================================================

  const handleStartProduction = async () => {
    if (!checkedOrder) {
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      await api.post(
        `/orders/${checkedOrder.orderId}/start-production`
      );


      setMessage({
        tone: "success",
        text: "Production started successfully",
      });


      /*
        Remove material result after
        production begins.
      */
      setMaterialCheck(null);


      /*
        Refresh order list so the
        status changes on screen.
      */
      await fetchOrders();


      /*
        Close the create modal after
        successfully starting production.
      */
      closeCreateOrderModal();


    } catch (error) {
      console.error(error);


      /*
        Backend says inventory is insufficient.
      */
      if (
        error.response?.status === 409 &&
        error.response?.data?.shortages
      ) {
        setMaterialCheck({
          canProduce: false,
          status: "MATERIAL_SHORTAGE",
          materials:
            error.response.data.shortages,
          shortages:
            error.response.data.shortages,
        });

      } else {
        setMessage({
          tone: "error",
          text:
            error.response?.data?.message ||
            "Failed to start production",
        });
      }

    } finally {
      setLoading(false);
    }
  };


  // =========================================================
  // OPEN MODAL
  // =========================================================

  const openCreateOrderModal = () => {
    setIsCreateOrderOpen(true);

    setSelectedProduct("");
    setQuantity(1);

    setMaterialCheck(null);
    setCheckedOrder(null);

    setMessage(null);
  };


  // =========================================================
  // CLOSE MODAL
  // =========================================================

  const closeCreateOrderModal = () => {
    setIsCreateOrderOpen(false);

    setSelectedProduct("");
    setQuantity(1);

    setMaterialCheck(null);
    setCheckedOrder(null);

    setMessage(null);
  };


  // =========================================================
  // PAGE
  // =========================================================

  return (
    <>
      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <PageHeader
        title="Orders"
        description="Manage and monitor manufacturing orders."
      />


      {/* =====================================================
          TOP TOOLBAR
      ====================================================== */}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        {/* Search */}

        <div className="w-full sm:max-w-sm">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search orders..."
          />
        </div>


        {/* Create Order Button */}

        <Button
          size="lg"
          onClick={openCreateOrderModal}
        >
          <Plus size={18} />

          Create Order
        </Button>

      </div>


      {/* =====================================================
          EXISTING ORDERS
      ====================================================== */}

      <Card className="overflow-hidden">

        <CardHeader>

          <div className="flex items-center justify-between gap-4">

            <div>

              <CardTitle>
                Existing Orders
              </CardTitle>

              <CardDescription>
                View all previously created manufacturing orders.
              </CardDescription>

            </div>


            <Badge variant="secondary">
              {filteredOrders.length}
            </Badge>

          </div>

        </CardHeader>


        {filteredOrders.length === 0 ? (

          <EmptyState
            icon={ClipboardList}
            title={
              search
                ? "No orders found"
                : "No orders yet"
            }
          >
            {search
              ? "Try a different search."
              : "Create your first order to see it here."}
          </EmptyState>

        ) : (

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>
                  Order
                </TableHead>

                <TableHead>
                  Product
                </TableHead>

                <TableHead className="text-right">
                  Qty
                </TableHead>

                <TableHead>
                  Status
                </TableHead>

                <TableHead className="text-right">
                  Action
                </TableHead>

              </TableRow>

            </TableHeader>


            <TableBody>

              {filteredOrders.map((order) => (

                <TableRow
                  key={`${order.id}-${order.product_id}`}
                  data-active={
                    checkedOrder?.orderId === order.id
                  }
                >

                  <TableCell className="font-medium tabular-nums">
                    {order.order_number}
                  </TableCell>


                  <TableCell>
                    {order.product_name}
                  </TableCell>


                  <TableCell className="text-right tabular-nums">
                    {order.quantity}
                  </TableCell>


                  <TableCell>
                    <OrderStatus status={order.status} />
                  </TableCell>


                  <TableCell className="text-right">

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        checking === order.id
                      }
                      onClick={() =>
                        runMaterialCheck(
                          order.id,
                          order.order_number
                        )
                      }
                    >

                      {checking === order.id && (
                        <Loader2
                          className="animate-spin"
                        />
                      )}

                      Check materials

                    </Button>

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        )}

      </Card>


      {/* =====================================================
          MATERIAL CHECK FOR EXISTING ORDER
      ====================================================== */}

      {materialCheck && checkedOrder && !isCreateOrderOpen && (

        <Card className="mt-6 overflow-hidden">

          <CardHeader>

            <div className="flex items-center justify-between gap-4">

              <div>

                <CardTitle>
                  Material Availability
                </CardTitle>

                <CardDescription>
                  {checkedOrder.orderNumber}
                </CardDescription>

              </div>


              <Badge
                variant={
                  materialCheck.canProduce
                    ? "success"
                    : "danger"
                }
              >
                {materialCheck.canProduce
                  ? "Ready for production"
                  : "Material shortage"}
              </Badge>

            </div>

          </CardHeader>


          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>
                  Component
                </TableHead>

                <TableHead className="text-right">
                  Required
                </TableHead>

                <TableHead className="text-right">
                  Available
                </TableHead>

                <TableHead className="text-right">
                  Shortage
                </TableHead>

                <TableHead>
                  Status
                </TableHead>

              </TableRow>

            </TableHeader>


            <TableBody>

              {materialCheck.materials?.map(
                (material) => {

                  const shortage =
                    Number(material.shortage) > 0;


                  return (

                    <TableRow
                      key={material.componentId}
                    >

                      <TableCell className="font-medium">
                        {material.name}
                      </TableCell>


                      <TableCell className="text-right tabular-nums">
                        {material.required}
                      </TableCell>


                      <TableCell className="text-right tabular-nums">
                        {material.available}
                      </TableCell>


                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          shortage &&
                            "font-medium text-destructive"
                        )}
                      >
                        {material.shortage}
                      </TableCell>


                      <TableCell>

                        <Badge
                          variant={
                            shortage
                              ? "danger"
                              : "success"
                          }
                        >
                          {shortage
                            ? "Short"
                            : "Covered"}
                        </Badge>

                      </TableCell>

                    </TableRow>

                  );

                }
              )}

            </TableBody>

          </Table>


          {materialCheck.canProduce && (

            <div className="p-6 pt-0">

              <Button
                onClick={
                  handleStartProduction
                }
                disabled={loading}
              >

                {loading && (
                  <Loader2
                    className="animate-spin"
                  />
                )}

                {loading
                  ? "Starting..."
                  : "Start Production"}

              </Button>

            </div>

          )}

        </Card>

      )}


      {/* =====================================================
          CREATE ORDER MODAL
      ====================================================== */}

      {isCreateOrderOpen && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {

            /*
              Close only when user clicks
              the dark background itself.

              Clicking inside the modal
              won't close it.
            */

            if (e.target === e.currentTarget) {
              closeCreateOrderModal();
            }

          }}
        >

          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background shadow-2xl"
          >

            {/* =================================================
                MODAL HEADER
            ================================================== */}

            <div className="flex items-start justify-between border-b p-6">

              <div>

                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  SALES ORDER
                </p>

                <h2 className="text-2xl font-semibold">
                  Create New Order
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Select a product and quantity to create an order.
                </p>

              </div>


              {/* <Button
                variant="outline"
                size="icon"
                onClick={
                  closeCreateOrderModal
                }
              >
                <X size={18} />
              </Button> */}

            </div>


            {/* =================================================
                MODAL CONTENT
            ================================================== */}

            <div className="space-y-6 p-6">

              {/* =================================================
                  CREATE FORM
              ================================================== */}

              {!materialCheck && (

                <form
                  onSubmit={
                    handleCreateOrder
                  }
                  className="space-y-5"
                >

                  {/* PRODUCT */}

                  <div>

                    <Label htmlFor="product">
                      Product
                    </Label>

                    <Select
                      id="product"
                      value={selectedProduct}
                      onChange={(e) =>
                        setSelectedProduct(
                          e.target.value
                        )
                      }
                    >

                      <option value="">
                        Select a product
                      </option>

                      {products.map(
                        (product) => (

                          <option
                            key={product.id}
                            value={product.id}
                          >
                            {product.name} (
                            {product.sku}
                            )
                          </option>

                        )
                      )}

                    </Select>

                  </div>


                  {/* QUANTITY */}

                  <div>

                    <Label htmlFor="quantity">
                      Production Quantity
                    </Label>

                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Number(
                            e.target.value
                          )
                        )
                      }
                    />

                  </div>


                  {/* MESSAGE */}

                  {message && (

                    <Notice tone={message.tone}>
                      {message.text}
                    </Notice>

                  )}


                  {/* BUTTONS */}

                  <div className="flex justify-end border-t pt-5">

                    <Button
                      type="submit"
                      disabled={creating}
                    >

                      {creating && (
                        <Loader2
                          className="animate-spin"
                        />
                      )}

                      {creating
                        ? "Creating order..."
                        : "Create Order"}

                    </Button>

                  </div>

                </form>

              )}


              {/* =================================================
                  AFTER ORDER IS CREATED
              ================================================== */}

              {materialCheck && (

                <div className="space-y-5">

                  {/* SUCCESS MESSAGE */}

                  {message && (

                    <Notice tone={message.tone}>
                      {message.text}
                    </Notice>

                  )}


                  {/* ORDER INFORMATION */}

                  <div className="rounded-xl border bg-muted/30 p-5">

                    <p className="text-sm text-muted-foreground">
                      Order created
                    </p>

                    <h3 className="mt-1 text-xl font-semibold">

                      {checkedOrder?.orderNumber}

                    </h3>

                  </div>


                  {/* MATERIAL STATUS */}

                  <div
                    className={
                      materialCheck.canProduce
                        ? "rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
                        : "rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
                    }
                  >

                    <div className="font-semibold">

                      {materialCheck.canProduce
                        ? "✓ Ready for Production"
                        : "✕ Material Shortage"}

                    </div>

                    <p className="mt-1 text-sm">

                      {materialCheck.canProduce
                        ? "All required materials are available."
                        : "Some required materials are insufficient."}

                    </p>

                  </div>


                  {/* MODAL ACTIONS */}

                  <div className="flex justify-end gap-3 border-t pt-5">

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        closeCreateOrderModal
                      }
                    >
                      Close
                    </Button>


                    {materialCheck.canProduce && (

                      <Button
                        type="button"
                        onClick={
                          handleStartProduction
                        }
                        disabled={loading}
                      >

                        {loading && (
                          <Loader2
                            className="animate-spin"
                          />
                        )}

                        {loading
                          ? "Starting..."
                          : "Start Production"}

                      </Button>

                    )}

                  </div>


                  {/* MATERIAL TABLE */}

                  <div className="overflow-hidden rounded-xl border">

                    <Table>

                      <TableHeader>

                        <TableRow>

                          <TableHead>
                            Component
                          </TableHead>

                          <TableHead className="text-right">
                            Required
                          </TableHead>

                          <TableHead className="text-right">
                            Available
                          </TableHead>

                          <TableHead className="text-right">
                            Shortage
                          </TableHead>

                          <TableHead>
                            Status
                          </TableHead>

                        </TableRow>

                      </TableHeader>


                      <TableBody>

                        {materialCheck.materials?.map(
                          (material) => {

                            const shortage =
                              Number(
                                material.shortage
                              ) > 0;


                            return (

                              <TableRow
                                key={
                                  material.componentId
                                }
                              >

                                <TableCell className="font-medium">
                                  {material.name}
                                </TableCell>


                                <TableCell className="text-right tabular-nums">
                                  {material.required}
                                </TableCell>


                                <TableCell className="text-right tabular-nums">
                                  {material.available}
                                </TableCell>


                                <TableCell
                                  className={cn(
                                    "text-right tabular-nums",
                                    shortage &&
                                      "font-medium text-destructive"
                                  )}
                                >
                                  {material.shortage}
                                </TableCell>


                                <TableCell>

                                  <Badge
                                    variant={
                                      shortage
                                        ? "danger"
                                        : "success"
                                    }
                                  >
                                    {shortage
                                      ? "Short"
                                      : "Covered"}
                                  </Badge>

                                </TableCell>

                              </TableRow>

                            );

                          }
                        )}

                      </TableBody>

                    </Table>

                  </div>


                </div>

              )}

            </div>

          </div>

        </div>

      )}
    </>
  );
}


import { useEffect, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Plus,
} from "lucide-react";

import api from "../api/api";
import SearchBar from "../components/SearchBar";
import PageHeader from "../components/PageHeader";

import {
  EmptyState,
  Notice,
  OrderStatus,
} from "../components/feedback";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

import {
  Input,
  Label,
  Select,
} from "../components/ui/input";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

import { cn } from "../lib/utils";


/*
=========================================================
HELPER FUNCTIONS
=========================================================
*/

/*
    Check whether a value is a positive integer.

    Valid:
    1
    5
    20
    100

    Invalid:
    empty
    0
    -1
    2.5
    abc
*/
const isPositiveInteger = (value) => {

  const text =
    String(value ?? "").trim();


  if (!/^\d+$/.test(text)) {

    return false;

  }


  const number =
    Number(text);


  return (
    Number.isSafeInteger(number) &&
    number > 0
  );

};


/*
    Convert a value to an integer only
    after validation.
*/
const toInteger = (value) => {

  return Number.parseInt(
    String(value),
    10
  );

};



export default function Orders() {

  /*
  =========================================================
  DATA
  =========================================================
  */

  const [
    orders,
    setOrders,
  ] = useState([]);


  const [
    products,
    setProducts,
  ] = useState([]);


  /*
  =========================================================
  SEARCH
  =========================================================
  */

  const [
    search,
    setSearch,
  ] = useState("");


  /*
  =========================================================
  CREATE ORDER MODAL
  =========================================================
  */

  const [
    isCreateOrderOpen,
    setIsCreateOrderOpen,
  ] = useState(false);


  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState("");


  /*
      Keep quantity as STRING while
      the user types.

      This prevents the
      "must be a positive integer"
      problem caused by Number("")
      becoming 0.
  */
  const [
    quantity,
    setQuantity,
  ] = useState("1");


  const [
    creating,
    setCreating,
  ] = useState(false);


  /*
  =========================================================
  MATERIAL CHECK MODAL
  =========================================================
  */

  const [
    materialCheckOrder,
    setMaterialCheckOrder,
  ] = useState(null);


  const [
    materialCheck,
    setMaterialCheck,
  ] = useState(null);


  const [
    checking,
    setChecking,
  ] = useState(null);



  /*
  =========================================================
  PARTIAL PRODUCTION MODAL
  =========================================================
  */

  const [
    partialProductionOrder,
    setPartialProductionOrder,
  ] = useState(null);


  const [
    partialProductionInfo,
    setPartialProductionInfo,
  ] = useState(null);


  /*
      Keep as STRING while typing.
  */
  const [
    partialQuantity,
    setPartialQuantity,
  ] = useState("1");


  const [
    loadingProductionInfo,
    setLoadingProductionInfo,
  ] = useState(false);


  const [
    startingProduction,
    setStartingProduction,
  ] = useState(false);


  const [
    partialProductionError,
    setPartialProductionError,
  ] = useState("");


  /*
  =========================================================
  PAGE MESSAGE
  =========================================================
  */

  const [
    message,
    setMessage,
  ] = useState(null);



  /*
  =========================================================
  FETCH ORDERS
  =========================================================
  */

  const fetchOrders = async () => {

    try {

      const response =
        await api.get("/orders");


      setOrders(
        response.data
      );

    } catch (error) {

      console.error(
        "Failed to fetch orders:",
        error
      );


      setMessage({

        tone: "error",

        text:
          error.response?.data?.message ||
          "Failed to load orders",

      });

    }

  };



  /*
  =========================================================
  FETCH PRODUCTS
  =========================================================
  */

  const fetchProducts = async () => {

    try {

      const response =
        await api.get("/products");


      setProducts(
        response.data
      );

    } catch (error) {

      console.error(
        "Failed to fetch products:",
        error
      );


      setMessage({

        tone: "error",

        text:
          error.response?.data?.message ||
          "Failed to load products",

      });

    }

  };



  /*
  =========================================================
  INITIAL LOAD
  =========================================================
  */

  useEffect(() => {

    fetchOrders();
    fetchProducts();

  }, []);



  /*
  =========================================================
  SEARCH
  =========================================================
  */

  const filteredOrders =
    orders.filter((order) => {

      const searchText =
        search.toLowerCase();


      return (

        (order.order_number || "")
          .toLowerCase()
          .includes(searchText)

        ||

        (order.product_name || "")
          .toLowerCase()
          .includes(searchText)

        ||

        (order.status || "")
          .toLowerCase()
          .includes(searchText)

      );

    });



  /*
  =========================================================
  OPEN MATERIAL CHECK MODAL
  =========================================================
  */

  const runMaterialCheck = async (
    order
  ) => {

    /*
        Open the popup immediately.
        This gives the user feedback while
        the backend is loading.
    */
    setMaterialCheckOrder(
      order
    );


    setMaterialCheck(
      null
    );


    setMessage(
      null
    );


    setChecking(
      order.id
    );


    try {

      const response =
        await api.get(
          `/orders/${order.id}/material-check`
        );


      setMaterialCheck(
        response.data
      );

    } catch (error) {

      console.error(
        error
      );


      setMaterialCheck({

        canProduce: false,

        materials: [],

        shortages: [],

        status:
          "ERROR",

      });


      setMessage({

        tone: "error",

        text:
          error.response?.data?.message ||
          "Failed to check materials",

      });

    } finally {

      setChecking(
        null
      );

    }

  };



  /*
  =========================================================
  CLOSE MATERIAL CHECK MODAL
  =========================================================
  */

  const closeMaterialCheckModal =
    () => {

      setMaterialCheckOrder(
        null
      );


      setMaterialCheck(
        null
      );


      setChecking(
        null
      );

    };



  /*
  =========================================================
  CREATE ORDER
  =========================================================
  */

  const handleCreateOrder =
    async (event) => {

      event.preventDefault();


      setMessage(
        null
      );


      /*
          Validate product.
      */
      if (!selectedProduct) {

        setMessage({

          tone: "error",

          text:
            "Please select a product",

        });


        return;

      }


      /*
          Validate integer quantity.
      */
      if (
        !isPositiveInteger(
          quantity
        )
      ) {

        setMessage({

          tone: "error",

          text:
            "Quantity must be a positive integer",

        });


        return;

      }


      const orderQuantity =
        toInteger(
          quantity
        );


      try {

        setCreating(
          true
        );


        const response =
          await api.post(
            "/orders",
            {
              items: [
                {
                  productId:
                    Number(
                      selectedProduct
                    ),

                  quantity:
                    orderQuantity,

                },
              ],
            }
          );


        /*
            Refresh Orders table.
        */
        await fetchOrders();


        /*
            Close Create Order modal.
        */
        closeCreateOrderModal();


        /*
            Show success message.
        */
        setMessage({

          tone: "success",

          text:
            `Order ${response.data.orderNumber} created successfully`,

        });


      } catch (error) {

        console.error(
          error
        );


        setMessage({

          tone: "error",

          text:
            error.response?.data?.message ||
            "Failed to create order",

        });

      } finally {

        setCreating(
          false
        );

      }

    };



  /*
  =========================================================
  OPEN PARTIAL PRODUCTION MODAL
  =========================================================
  */

  const openPartialProductionModal =
    async (order) => {

      /*
          Close material modal first.
      */
      closeMaterialCheckModal();


      setPartialProductionOrder(
        order
      );


      setPartialProductionInfo(
        null
      );


      setPartialQuantity(
        "1"
      );


      setPartialProductionError(
        ""
      );


      setLoadingProductionInfo(
        true
      );


      try {

        const response =
          await api.get(
            `/orders/${order.id}/production-info`
          );


        const info =
          response.data;


        setPartialProductionInfo(
          info
        );


        const maxQuantity =
          Number(
            info.maxProductionQuantity
          );


        /*
            If production is possible,
            default to 1.

            Otherwise leave it blank.
        */
        if (
          Number.isSafeInteger(
            maxQuantity
          ) &&
          maxQuantity > 0
        ) {

          setPartialQuantity(
            "1"
          );

        } else {

          setPartialQuantity(
            ""
          );

        }

      } catch (error) {

        console.error(
          error
        );


        setPartialProductionError(

          error.response?.data?.message ||

          "Failed to load production information"

        );

      } finally {

        setLoadingProductionInfo(
          false
        );

      }

    };



  /*
  =========================================================
  CLOSE PARTIAL PRODUCTION MODAL
  =========================================================
  */

  const closePartialProductionModal =
    () => {

      setPartialProductionOrder(
        null
      );


      setPartialProductionInfo(
        null
      );


      setPartialQuantity(
        "1"
      );


      setPartialProductionError(
        ""
      );

    };



  /*
  =========================================================
  USE MAX INVENTORY
  =========================================================
  */

  const handleUseMaxInventory =
    () => {

      if (
        !partialProductionInfo
      ) {

        return;

      }


      const maxQuantity =
        Number(
          partialProductionInfo
            .maxProductionQuantity
        );


      if (
        !Number.isSafeInteger(
          maxQuantity
        ) ||
        maxQuantity <= 0
      ) {

        setPartialProductionError(

          "No additional quantity can currently be started from available inventory."

        );


        return;

      }


      setPartialQuantity(
        String(
          maxQuantity
        )
      );


      setPartialProductionError(
        ""
      );

    };



  /*
  =========================================================
  START PARTIAL PRODUCTION
  =========================================================
  */

  const handleStartPartialProduction =
    async () => {

      /*
          Validate before converting.
      */
      if (
        !isPositiveInteger(
          partialQuantity
        )
      ) {

        setPartialProductionError(

          "Production quantity must be a positive integer."

        );


        return;

      }


      const selectedQuantity =
        toInteger(
          partialQuantity
        );


      const maxQuantity =
        Number(
          partialProductionInfo
            ?.maxProductionQuantity
        );


      /*
          Check that maximum exists.
      */
      if (
        !Number.isSafeInteger(
          maxQuantity
        ) ||
        maxQuantity <= 0
      ) {

        setPartialProductionError(

          "No additional quantity can currently be started from available inventory."

        );


        return;

      }


      /*
          Frontend safety check.
      */
      if (
        selectedQuantity >
        maxQuantity
      ) {

        setPartialProductionError(

          `Maximum currently possible quantity is ${maxQuantity}.`

        );


        return;

      }


      try {

        setStartingProduction(
          true
        );


        setPartialProductionError(
          ""
        );


        const response =
          await api.post(
            `/orders/${partialProductionOrder.id}/start-production`,
            {
              quantity:
                selectedQuantity,
            }
          );


        /*
            Refresh Orders table.
        */
        await fetchOrders();


        /*
            Close popup.
        */
        closePartialProductionModal();


        /*
            Success message.
        */
        setMessage({

          tone: "success",

          text:
            `${selectedQuantity} product(s) started for ${response.data.orderNumber}`,

        });

      } catch (error) {

        console.error(
          error
        );


        /*
            Backend material shortage.
        */
        if (
          error.response?.data?.shortages
        ) {

          const shortages =
            error.response.data.shortages;


          const shortageNames =
            shortages
              .map(
                (item) =>
                  `${item.name}: shortage ${item.shortage}`
              )
              .join(", ");


          setPartialProductionError(

            `Not enough materials. ${shortageNames}`

          );

        } else {

          setPartialProductionError(

            error.response?.data?.message ||

            "Failed to start production"

          );

        }

      } finally {

        setStartingProduction(
          false
        );

      }

    };



  /*
  =========================================================
  OPEN CREATE ORDER MODAL
  =========================================================
  */

  const openCreateOrderModal =
    () => {

      setIsCreateOrderOpen(
        true
      );


      setSelectedProduct(
        ""
      );


      setQuantity(
        "1"
      );


      setMessage(
        null
      );

    };



  /*
  =========================================================
  CLOSE CREATE ORDER MODAL
  =========================================================
  */

  const closeCreateOrderModal =
    () => {

      setIsCreateOrderOpen(
        false
      );


      setSelectedProduct(
        ""
      );


      setQuantity(
        "1"
      );

    };



  /*
  =========================================================
  PAGE
  =========================================================
  */

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

      <div
        className="
          mb-6
          flex
          flex-col
          gap-4
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >

        <div
          className="
            w-full
            sm:max-w-sm
          "
        >

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search orders..."
          />

        </div>


        <Button
          size="lg"
          onClick={
            openCreateOrderModal
          }
        >

          <Plus size={18} />

          Create Order

        </Button>

      </div>



      {/* =====================================================
          PAGE MESSAGE
      ====================================================== */}

      {message && (

        <div className="mb-6">

          <Notice
            tone={
              message.tone
            }
          >

            {
              message.text
            }

          </Notice>

        </div>

      )}



      {/* =====================================================
          EXISTING ORDERS
      ====================================================== */}

      <Card
        className="
          overflow-hidden
        "
      >

        <CardHeader>

          <div
            className="
              flex
              items-center
              justify-between
              gap-4
            "
          >

            <div>

              <CardTitle>
                Existing Orders
              </CardTitle>


              <CardDescription>
                View all previously created manufacturing orders.
              </CardDescription>

            </div>


            <Badge
              variant="secondary"
            >

              {
                filteredOrders.length
              }

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
              : "Create your first order to see it here."
            }

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


                <TableHead
                  className="
                    text-right
                  "
                >

                  Qty

                </TableHead>


                <TableHead>
                  Status
                </TableHead>


                <TableHead
                  className="
                    text-right
                  "
                >

                  Action

                </TableHead>

              </TableRow>

            </TableHeader>



            <TableBody>

              {filteredOrders.map(
                (order) => (

                  <TableRow
                    key={
                      `${order.id}-${order.product_id}`
                    }
                  >

                    {/* ORDER */}

                    <TableCell
                      className="
                        font-medium
                        tabular-nums
                      "
                    >

                      {
                        order.order_number
                      }

                    </TableCell>



                    {/* PRODUCT */}

                    <TableCell>

                      {
                        order.product_name
                      }

                    </TableCell>



                    {/* QUANTITY */}

                    <TableCell
                      className="
                        text-right
                        tabular-nums
                      "
                    >

                      {
                        Number(
                          order.quantity
                        )
                      }

                    </TableCell>



                    {/* STATUS */}

                    <TableCell>

                      <OrderStatus
                        status={
                          order.status
                        }
                      />

                    </TableCell>



                    {/* ACTIONS */}

                    <TableCell>

                      <div
                        className="
                          flex
                          flex-wrap
                          justify-end
                          gap-2
                        "
                      >

                        {/* CHECK MATERIALS */}

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            checking ===
                            order.id
                          }
                          onClick={() =>
                            runMaterialCheck(
                              order
                            )
                          }
                        >

                          {checking ===
                            order.id && (

                            <Loader2
                              className="
                                animate-spin
                              "
                            />

                          )}

                          Check materials

                        </Button>



                        {/* START PRODUCTION */}

                        {order.status !==
                          "COMPLETED" && (

                          <Button
                            size="sm"
                            onClick={() =>
                              openPartialProductionModal(
                                order
                              )
                            }
                          >

                            {order.status ===
                            "IN_PRODUCTION"

                              ? "Start More"

                              : "Start Production"

                            }

                          </Button>

                        )}

                      </div>

                    </TableCell>

                  </TableRow>

                )
              )}

            </TableBody>

          </Table>

        )}

      </Card>



      {/* =====================================================
          MATERIAL CHECK MODAL
      ====================================================== */}

      {materialCheckOrder && (

        <div
          className="
            fixed
            inset-0
            z-[50]
            flex
            items-center
            justify-center
            bg-black/50
            p-4
          "
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {

              closeMaterialCheckModal();

            }

          }}
        >

          <div
            className="
              max-h-[90vh]
              w-full
              max-w-4xl
              overflow-y-auto
              rounded-2xl
              bg-background
              shadow-2xl
            "
          >

            {/* =================================================
                HEADER
            ================================================== */}

            <div
              className="
                border-b
                p-6
              "
            >

              <p
                className="
                  mb-1
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wider
                  text-muted-foreground
                "
              >

                MATERIAL CHECK

              </p>


              <h2
                className="
                  text-2xl
                  font-semibold
                "
              >

                Material Availability

              </h2>


              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >

                Check whether the required components are available for this order.

              </p>

            </div>



            <div
              className="
                space-y-6
                p-6
              "
            >

              {/* =================================================
                  ORDER INFORMATION
              ================================================== */}

              <div
                className="
                  rounded-xl
                  border
                  bg-muted/30
                  p-5
                "
              >

                <div
                  className="
                    flex
                    flex-col
                    gap-3
                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >

                  <div>

                    <p
                      className="
                        text-sm
                        text-muted-foreground
                      "
                    >

                      Order

                    </p>


                    <h3
                      className="
                        mt-1
                        text-xl
                        font-semibold
                        tabular-nums
                      "
                    >

                      {
                        materialCheckOrder
                          .order_number
                      }

                    </h3>


                    <p
                      className="
                        mt-1
                        text-sm
                        text-muted-foreground
                      "
                    >

                      {
                        materialCheckOrder
                          .product_name
                      }

                    </p>

                  </div>


                  <div>

                    <p
                      className="
                        text-sm
                        text-muted-foreground
                      "
                    >

                      Order quantity

                    </p>


                    <p
                      className="
                        mt-1
                        text-xl
                        font-semibold
                        tabular-nums
                      "
                    >

                      {
                        Number(
                          materialCheckOrder
                            .quantity
                        )
                      }

                    </p>

                  </div>

                </div>

              </div>



              {/* =================================================
                  LOADING
              ================================================== */}

              {checking ===
                materialCheckOrder.id && (

                <div
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                    py-10
                    text-sm
                    text-muted-foreground
                  "
                >

                  <Loader2
                    className="
                      animate-spin
                    "
                  />

                  Checking material availability...

                </div>

              )}



              {/* =================================================
                  MATERIAL RESULT
              ================================================== */}

              {checking !==
                materialCheckOrder.id &&
                materialCheck && (

                <>

                  {/* STATUS */}

                  <div
                    className={
                      materialCheck.canProduce

                        ? `
                          rounded-xl
                          border
                          border-green-200
                          bg-green-50
                          p-5
                          text-green-800
                        `

                        : `
                          rounded-xl
                          border
                          border-red-200
                          bg-red-50
                          p-5
                          text-red-800
                        `
                    }
                  >

                    <div
                      className="
                        font-semibold
                        text-lg
                      "
                    >

                      {materialCheck.canProduce

                        ? "✓ Ready for Production"

                        : "✕ Material Shortage"

                      }

                    </div>


                    <p
                      className="
                        mt-1
                        text-sm
                      "
                    >

                      {materialCheck.canProduce

                        ? "All required materials are currently available for the full order."

                        : "Some required materials are not available in sufficient quantity."

                      }

                    </p>

                  </div>



                  {/* =================================================
                      ACTION BUTTONS
                  ================================================== */}

                  <div
                    className="
                      flex
                      justify-end
                      gap-3
                      border-t
                      pt-5
                    "
                  >

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        closeMaterialCheckModal
                      }
                    >

                      Close

                    </Button>


                    <Button
                      type="button"
                      onClick={() =>
                        openPartialProductionModal(
                          materialCheckOrder
                        )
                      }
                    >

                      Start Production

                    </Button>

                  </div>



                  {/* =================================================
                      MATERIAL AVAILABILITY TABLE
                  ================================================== */}

                  <div>

                    <div
                      className="
                        mb-3
                        flex
                        items-center
                        justify-between
                      "
                    >

                      <div>

                        <h3
                          className="
                            text-lg
                            font-semibold
                          "
                        >

                          Material Availability

                        </h3>


                        <p
                          className="
                            text-sm
                            text-muted-foreground
                          "
                        >

                          Required components compared with current available inventory.

                        </p>

                      </div>

                    </div>



                    <div
                      className="
                        overflow-hidden
                        rounded-xl
                        border
                      "
                    >

                      <Table>

                        <TableHeader>

                          <TableRow>

                            <TableHead>
                              Component
                            </TableHead>


                            <TableHead
                              className="
                                text-right
                              "
                            >

                              Required

                            </TableHead>


                            <TableHead
                              className="
                                text-right
                              "
                            >

                              Available

                            </TableHead>


                            <TableHead
                              className="
                                text-right
                              "
                            >

                              Shortage

                            </TableHead>


                            <TableHead>
                              Status
                            </TableHead>

                          </TableRow>

                        </TableHeader>



                        <TableBody>

                          {materialCheck.materials &&
                            materialCheck.materials.length > 0 ? (

                            materialCheck.materials.map(
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

                                    <TableCell
                                      className="
                                        font-medium
                                      "
                                    >

                                      {
                                        material.name
                                      }

                                    </TableCell>


                                    <TableCell
                                      className="
                                        text-right
                                        tabular-nums
                                      "
                                    >

                                      {
                                        material.required
                                      }

                                    </TableCell>


                                    <TableCell
                                      className="
                                        text-right
                                        tabular-nums
                                      "
                                    >

                                      {
                                        material.available
                                      }

                                    </TableCell>


                                    <TableCell
                                      className={cn(
                                        `
                                          text-right
                                          tabular-nums
                                        `,

                                        shortage &&
                                          `
                                            font-medium
                                            text-destructive
                                          `
                                      )}
                                    >

                                      {
                                        material.shortage
                                      }

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
                                          : "Covered"
                                        }

                                      </Badge>

                                    </TableCell>

                                  </TableRow>

                                );

                              }
                            )

                          ) : (

                            <TableRow>

                              <TableCell
                                colSpan={5}
                                className="
                                  py-8
                                  text-center
                                  text-muted-foreground
                                "
                              >

                                No material information available.

                              </TableCell>

                            </TableRow>

                          )}

                        </TableBody>

                      </Table>

                    </div>

                  </div>

                </>

              )}

            </div>

          </div>

        </div>

      )}



      {/* =====================================================
          CREATE ORDER MODAL
      ====================================================== */}

      {isCreateOrderOpen && (

        <div
          className="
            fixed
            inset-0
            z-[50]
            flex
            items-center
            justify-center
            bg-black/50
            p-4
          "
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {

              closeCreateOrderModal();

            }

          }}
        >

          <div
            className="
              w-full
              max-w-xl
              rounded-2xl
              bg-background
              shadow-2xl
            "
          >

            {/* HEADER */}

            <div
              className="
                border-b
                p-6
              "
            >

              <p
                className="
                  mb-1
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wider
                  text-muted-foreground
                "
              >

                SALES ORDER

              </p>


              <h2
                className="
                  text-2xl
                  font-semibold
                "
              >

                Create New Order

              </h2>


              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >

                Select a product and an integer quantity to create an order.

              </p>

            </div>



            {/* FORM */}

            <form
              onSubmit={
                handleCreateOrder
              }
              className="
                space-y-5
                p-6
              "
            >

              {/* PRODUCT */}

              <div>

                <Label
                  htmlFor="product"
                >

                  Product

                </Label>


                <Select
                  id="product"
                  value={
                    selectedProduct
                  }
                  onChange={(event) =>
                    setSelectedProduct(
                      event.target.value
                    )
                  }
                >

                  <option value="">
                    Select a product
                  </option>


                  {products.map(
                    (product) => (

                      <option
                        key={
                          product.id
                        }
                        value={
                          product.id
                        }
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

                <Label
                  htmlFor="quantity"
                >

                  Order Quantity

                </Label>


                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={
                    quantity
                  }
                  onChange={(event) =>
                    setQuantity(
                      event.target.value
                    )
                  }
                />


                <p
                  className="
                    mt-2
                    text-xs
                    text-muted-foreground
                  "
                >

                  Enter a whole number such as 1, 5, 20 or 100.

                </p>

              </div>



              {/* MESSAGE */}

              {message && (

                <Notice
                  tone={
                    message.tone
                  }
                >

                  {
                    message.text
                  }

                </Notice>

              )}



              {/* BUTTONS */}

              <div
                className="
                  flex
                  justify-end
                  gap-3
                  border-t
                  pt-5
                "
              >

                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    closeCreateOrderModal
                  }
                >

                  Cancel

                </Button>


                <Button
                  type="submit"
                  disabled={
                    creating
                  }
                >

                  {creating && (

                    <Loader2
                      className="
                        animate-spin
                      "
                    />

                  )}


                  {creating

                    ? "Creating order..."

                    : "Create Order"

                  }

                </Button>

              </div>

            </form>

          </div>

        </div>

      )}



      {/* =====================================================
          PARTIAL PRODUCTION MODAL
      ====================================================== */}

      {partialProductionOrder && (

        <div
          className="
            fixed
            inset-0
            z-[60]
            flex
            items-center
            justify-center
            bg-black/50
            p-4
          "
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {

              closePartialProductionModal();

            }

          }}
        >

          <div
            className="
              max-h-[90vh]
              w-full
              max-w-xl
              overflow-y-auto
              rounded-2xl
              bg-background
              shadow-2xl
            "
          >

            {/* HEADER */}

            <div
              className="
                border-b
                p-6
              "
            >

              <p
                className="
                  mb-1
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wider
                  text-muted-foreground
                "
              >

                PRODUCTION

              </p>


              <h2
                className="
                  text-2xl
                  font-semibold
                "
              >

                Start Partial Production

              </h2>


              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >

                Choose how many products you want to start now.

              </p>

            </div>



            <div
              className="
                space-y-6
                p-6
              "
            >

              {/* ORDER INFORMATION */}

              <div
                className="
                  rounded-xl
                  border
                  bg-muted/30
                  p-5
                "
              >

                <p
                  className="
                    text-sm
                    text-muted-foreground
                  "
                >

                  Order

                </p>


                <h3
                  className="
                    mt-1
                    text-xl
                    font-semibold
                    tabular-nums
                  "
                >

                  {
                    partialProductionOrder
                      .order_number
                  }

                </h3>


                <p
                  className="
                    mt-1
                    text-sm
                    text-muted-foreground
                  "
                >

                  {
                    partialProductionOrder
                      .product_name
                  }

                </p>

              </div>



              {/* LOADING */}

              {loadingProductionInfo && (

                <div
                  className="
                    flex
                    items-center
                    justify-center
                    gap-2
                    py-8
                    text-sm
                    text-muted-foreground
                  "
                >

                  <Loader2
                    className="
                      animate-spin
                    "
                  />

                  Loading production information...

                </div>

              )}



              {/* PRODUCTION INFO */}

              {!loadingProductionInfo &&
                partialProductionInfo && (

                  <>

                    {/* STATS */}

                    <div
                      className="
                        grid
                        grid-cols-2
                        gap-3
                        sm:grid-cols-4
                      "
                    >

                      {/* ORDERED */}

                      <div
                        className="
                          rounded-lg
                          border
                          p-3
                        "
                      >

                        <p
                          className="
                            text-xs
                            text-muted-foreground
                          "
                        >

                          Ordered

                        </p>


                        <p
                          className="
                            mt-1
                            text-lg
                            font-semibold
                            tabular-nums
                          "
                        >

                          {Number(
                            partialProductionInfo
                              .orderedQuantity
                          )}

                        </p>

                      </div>



                      {/* STARTED */}

                      <div
                        className="
                          rounded-lg
                          border
                          p-3
                        "
                      >

                        <p
                          className="
                            text-xs
                            text-muted-foreground
                          "
                        >

                          Started

                        </p>


                        <p
                          className="
                            mt-1
                            text-lg
                            font-semibold
                            tabular-nums
                          "
                        >

                          {Number(
                            partialProductionInfo
                              .quantityToProduce
                          )}

                        </p>

                      </div>



                      {/* COMPLETED */}

                      <div
                        className="
                          rounded-lg
                          border
                          p-3
                        "
                      >

                        <p
                          className="
                            text-xs
                            text-muted-foreground
                          "
                        >

                          Completed

                        </p>


                        <p
                          className="
                            mt-1
                            text-lg
                            font-semibold
                            tabular-nums
                          "
                        >

                          {Number(
                            partialProductionInfo
                              .quantityCompleted
                          )}

                        </p>

                      </div>



                      {/* REMAINING */}

                      <div
                        className="
                          rounded-lg
                          border
                          p-3
                        "
                      >

                        <p
                          className="
                            text-xs
                            text-muted-foreground
                          "
                        >

                          Remaining

                        </p>


                        <p
                          className="
                            mt-1
                            text-lg
                            font-semibold
                            tabular-nums
                          "
                        >

                          {Number(
                            partialProductionInfo
                              .remainingToStart
                          )}

                        </p>

                      </div>

                    </div>



                    {/* MAX INVENTORY */}

                    <div
                      className="
                        rounded-xl
                        border
                        border-primary/20
                        bg-primary/5
                        p-5
                      "
                    >

                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-4
                        "
                      >

                        <div>

                          <p
                            className="
                              text-sm
                              font-medium
                            "
                          >

                            Maximum from current inventory

                          </p>


                          <p
                            className="
                              mt-1
                              text-sm
                              text-muted-foreground
                            "
                          >

                            Maximum number of products that can currently be started using available components.

                          </p>

                        </div>


                        <div
                          className="
                            text-2xl
                            font-bold
                            tabular-nums
                          "
                        >

                          {Number(
                            partialProductionInfo
                              .maxProductionQuantity
                          )}

                        </div>

                      </div>


                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={
                          handleUseMaxInventory
                        }
                        disabled={
                          Number(
                            partialProductionInfo
                              .maxProductionQuantity
                          ) <= 0
                        }
                      >

                        Use Max Inventory

                      </Button>

                    </div>



                    {/* QUANTITY */}

                    <div>

                      <Label
                        htmlFor="partial-quantity"
                      >

                        Quantity to Start

                      </Label>


                      <Input
                        id="partial-quantity"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        max={Number(
                          partialProductionInfo
                            .maxProductionQuantity
                        )}
                        value={
                          partialQuantity
                        }
                        onChange={(event) =>
                          setPartialQuantity(
                            event.target.value
                          )
                        }
                        disabled={
                          Number(
                            partialProductionInfo
                              .maxProductionQuantity
                          ) <= 0
                        }
                      />


                      <p
                        className="
                          mt-2
                          text-xs
                          text-muted-foreground
                        "
                      >

                        Maximum currently possible:

                        {" "}

                        {Number(
                          partialProductionInfo
                            .maxProductionQuantity
                        )}

                      </p>

                    </div>



                    {/* ERROR */}

                    {partialProductionError && (

                      <Notice
                        tone="error"
                      >

                        {
                          partialProductionError
                        }

                      </Notice>

                    )}



                    {/* BUTTONS */}

                    <div
                      className="
                        flex
                        justify-end
                        gap-3
                        border-t
                        pt-5
                      "
                    >

                      <Button
                        type="button"
                        variant="outline"
                        onClick={
                          closePartialProductionModal
                        }
                      >

                        Cancel

                      </Button>


                      <Button
                        type="button"
                        onClick={
                          handleStartPartialProduction
                        }
                        disabled={
                          startingProduction ||
                          loadingProductionInfo ||
                          Number(
                            partialProductionInfo
                              .maxProductionQuantity
                          ) <= 0
                        }
                      >

                        {startingProduction && (

                          <Loader2
                            className="
                              animate-spin
                            "
                          />

                        )}


                        {startingProduction

                          ? "Starting..."

                          : "Start Production"

                        }

                      </Button>

                    </div>

                  </>

                )}



              {/* ERROR LOADING PRODUCTION INFO */}

              {!loadingProductionInfo &&
                !partialProductionInfo &&
                partialProductionError && (

                  <Notice
                    tone="error"
                  >

                    {
                      partialProductionError
                    }

                  </Notice>

                )}

            </div>

          </div>

        </div>

      )}

    </>

  );

}
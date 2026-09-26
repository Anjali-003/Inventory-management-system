// import { useEffect, useState } from "react";
// import api from "../api/api";

// function Orders() {
//   const [orders, setOrders] = useState([]);
//   const [products, setProducts] = useState([]);

//   const [selectedProduct, setSelectedProduct] = useState("");

//   const [quantity, setQuantity] = useState(1);

//   const [selectedOrder, setSelectedOrder] = useState(null);

//   const [materialCheck, setMaterialCheck] = useState(null);

//   const [loading, setLoading] = useState(false);

//   const [message, setMessage] = useState("");

//   useEffect(() => {
//     fetchOrders();
//     fetchProducts();
//   }, []);

//   const fetchOrders = async () => {
//     try {
//       const response = await api.get("/orders");

//       setOrders(response.data);
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   const fetchProducts = async () => {
//     try {
//       const response = await api.get("/products");

//       setProducts(response.data);
//     } catch (error) {
//       console.error(error);
//     }
//   };
//   const handleCreateOrder = async () => {
//     setMessage("");

//     if (!selectedProduct) {
//       setMessage("Please select a product");
//       return;
//     }

//     if (quantity <= 0) {
//       setMessage("Quantity must be greater than 0");
//       return;
//     }

//     try {
//       setLoading(true);

//       const response = await api.post("/orders", {
//         items: [
//           {
//             productId: Number(selectedProduct),
//             quantity: quantity,
//           },
//         ],
//       });

//       setSelectedOrder(response.data);

//       setMessage("Order created successfully");

//       await fetchOrders();
//     } catch (error) {
//       console.error(error);

//       setMessage("Failed to create order");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div>
//       <h1>Orders</h1>

//       <p>Create a manufacturing order</p>
//       <div className="order-form">
//         <h2>Create Order</h2>

//         <label>Product</label>

//         <select
//           value={selectedProduct}
//           onChange={(e) => setSelectedProduct(e.target.value)}
//         >
//           <option value="">Select Product</option>

//           {products.map((product) => (
//             <option key={product.id} value={product.id}>
//               {product.name}
//             </option>
//           ))}
//         </select>

//         <label>Quantity</label>

//         <input
//           type="number"
//           min="1"
//           value={quantity}
//           onChange={(e) => setQuantity(Number(e.target.value))}
//         />

//         <button onClick={handleCreateOrder} disabled={loading}>
//           {loading ? "Creating..." : "Create Order"}
//         </button>
//         {selectedOrder && (
//           <div className="order-result">
//             <h2>Order Created</h2>

//             <p>Order Number: {selectedOrder.orderNumber}</p>

//             <p>Order ID: {selectedOrder.orderId}</p>

//             <button onClick={handleMaterialCheck}>Check Materials</button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// export default Orders;

import { useEffect, useState } from "react";
import api from "../api/api";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedProduct, setSelectedProduct] = useState("");

  const [quantity, setQuantity] = useState(1);

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [materialCheck, setMaterialCheck] = useState(null);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get("/orders");

      setOrders(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await api.get("/products");

      setProducts(response.data);
    } catch (error) {
      console.error(error);
    }
  };
  

  const handleCreateOrder = async () => {
    setMessage("");

    if (!selectedProduct) {
      setMessage("Please select a product");
      return;
    }

    if (quantity <= 0) {
      setMessage("Quantity must be greater than 0");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/orders", {
        items: [
          {
            productId: Number(selectedProduct),
            quantity: quantity,
          },
        ],
      });

      setSelectedOrder(response.data);

      setMessage("Order created successfully");

      await fetchOrders();
    } catch (error) {
      console.error(error);

      setMessage("Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialCheck = async () => {
    if (!selectedOrder) {
      return;
    }

    try {
      setLoading(true);

      const response = await api.get(
        `/orders/${selectedOrder.orderId}/material-check`,
      );

      setMaterialCheck(response.data);
    } catch (error) {
      console.error(error);

      setMessage("Failed to check materials");
    } finally {
      setLoading(false);
    }
  };

  const handleStartProduction =
    async () => {

        if (!selectedOrder) {
            return;
        }

        try {

            setLoading(true);

            const response =
                await api.post(
                    `/orders/${selectedOrder.orderId}/start-production`
                );


            setMessage(
                "Production started successfully"
            );


            /*
                Store new production information
            */
            setSelectedOrder({
                ...selectedOrder,
                status: response.data.status
            });


            /*
                Reload orders so the table
                shows IN_PRODUCTION.
            */
            await fetchOrders();


            /*
                Run material check again.
            */
            setMaterialCheck(null);

        } catch (error) {

            console.error(error);


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
                        error.response.data.shortages
                });

            } else {

                setMessage(
                    error.response?.data?.message ||
                    "Failed to start production"
                );

            }

        } finally {

            setLoading(false);

        }

    };

  return (
    <div>
      <h1>Orders</h1>

      <p>Create a manufacturing order</p>

      <div className="order-form">
        <h2>Create Order</h2>

        <label>Product</label>

        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
        >
          <option value="">Select Product</option>

          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        <label>Quantity</label>

        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />

        <button onClick={handleCreateOrder} disabled={loading}>
          {loading ? "Creating..." : "Create Order"}
        </button>

        {selectedOrder && (
          <div className="order-result">
            <h2>Order Created</h2>

            <p>Order Number: {selectedOrder.orderNumber}</p>

            <p>Order ID: {selectedOrder.orderId}</p>

            <button onClick={handleMaterialCheck}>Check Materials</button>
          </div>
        )}

        {materialCheck &&
          materialCheck.canProduce && (

            <button
              onClick={handleStartProduction}
              disabled={loading}
            >
              {loading
                ? "Starting..."
                : "Start Production"
              }
            </button>

        )}

        {materialCheck && (
          <div className="material-result">
            <h2>Material Availability</h2>

            <div
              className={materialCheck.canProduce ? "success-box" : "error-box"}
            >
              <h3>
                {materialCheck.canProduce
                  ? "✓ Ready for Production"
                  : "✕ Material Shortage"}
              </h3>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Required</th>
                  <th>Available</th>
                  <th>Shortage</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {materialCheck.materials.map((material) => (
                  <tr key={material.componentId}>
                    <td>{material.name}</td>

                    <td>{material.required}</td>

                    <td>{material.available}</td>

                    <td>{material.shortage}</td>

                    <td>{material.status}</td>
                  </tr>
                ))}

                <div className="table-container">
                  <h2>Existing Orders</h2>

                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {orders.map((order) => (
                        <tr key={`${order.id}-${order.product_id}`}>
                          <td>{order.order_number}</td>

                          <td>{order.product_name}</td>

                          <td>{order.quantity}</td>

                          <td>{order.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Orders;
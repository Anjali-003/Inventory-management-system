import { useEffect, useState } from "react";
import api from "../api/api";

function ExistingOrders() {
  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);

      const response = await api.get("/orders");

      setOrders(response.data);
    } catch (error) {
      console.error(error);

      setError("Failed to load existing orders");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <h1>Loading orders...</h1>;
  }

  if (error) {
    return <h1>{error}</h1>;
  }

  return (
    <div>
      <h1>Existing Orders</h1>

      <p>
        View all previously created manufacturing orders
      </p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>

          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    textAlign: "center",
                  }}
                >
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={`${order.id}-${order.product_id}`}
                >
                  <td>
                    {order.order_number}
                  </td>

                  <td>
                    {order.product_name}
                  </td>

                  <td>
                    {order.quantity}
                  </td>

                  <td>
                    {order.status}
                  </td>

                  <td>
                    {order.created_at
                      ? new Date(
                          order.created_at
                        ).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ExistingOrders;
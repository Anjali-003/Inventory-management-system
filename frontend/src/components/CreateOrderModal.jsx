import { useState } from "react";
import { X } from "lucide-react";
import api from "../api/api";

function CreateOrderModal({
  isOpen,
  onClose,
  products,
  onOrderCreated,
}) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [createdOrder, setCreatedOrder] = useState(null);
  const [materialCheck, setMaterialCheck] = useState(null);

  const [loading, setLoading] = useState(false);
  const [checkingMaterials, setCheckingMaterials] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!isOpen) {
    return null;
  }

  const handleCreateOrder = async () => {
    setError("");
    setMessage("");

    if (!selectedProduct) {
      setError("Please select a product");
      return;
    }

    if (!quantity || quantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/orders", {
        items: [
          {
            productId: Number(selectedProduct),
            quantity: Number(quantity),
          },
        ],
      });

      setCreatedOrder(response.data);

      setMessage("Order created successfully");

      onOrderCreated();

    } catch (error) {
      console.error(error);

      setError(
        error.response?.data?.message ||
        "Failed to create order"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialCheck = async () => {
    if (!createdOrder) {
      return;
    }

    try {
      setCheckingMaterials(true);
      setError("");

      const response = await api.get(
        `/orders/${createdOrder.orderId}/material-check`
      );

      setMaterialCheck(response.data);

    } catch (error) {
      console.error(error);

      setError("Failed to check materials");
    } finally {
      setCheckingMaterials(false);
    }
  };

  const handleStartProduction = async () => {
    if (!createdOrder) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await api.post(
        `/orders/${createdOrder.orderId}/start-production`
      );

      setCreatedOrder({
        ...createdOrder,
        status: response.data.status,
      });

      setMaterialCheck(null);

      setMessage("Production started successfully");

      onOrderCreated();

    } catch (error) {
      console.error(error);

      if (
        error.response?.status === 409 &&
        error.response?.data?.shortages
      ) {
        setMaterialCheck({
          canProduce: false,
          status: "MATERIAL_SHORTAGE",
          materials: error.response.data.shortages,
        });
      } else {
        setError(
          error.response?.data?.message ||
          "Failed to start production"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedProduct("");
    setQuantity(1);
    setCreatedOrder(null);
    setMaterialCheck(null);
    setError("");
    setMessage("");

    onClose();
  };

  return (
    <div className="modal-overlay">

      <div className="order-modal">

        <div className="modal-header">

          <div>
            <p className="modal-eyebrow">
              SALES ORDER
            </p>

            <h2>
              Create New Order
            </h2>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
          >
            <X size={20} />
          </button>

        </div>


        <div className="modal-body">

          {!createdOrder && (

            <>
              <label>
                Product
              </label>

              <select
                value={selectedProduct}
                onChange={(e) =>
                  setSelectedProduct(e.target.value)
                }
              >
                <option value="">
                  Select Product
                </option>

                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                  >
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>


              <label>
                Quantity
              </label>

              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Number(e.target.value))
                }
              />
            </>

          )}


          {error && (
            <div className="modal-error">
              {error}
            </div>
          )}


          {message && (
            <div className="modal-message">
              {message}
            </div>
          )}


          {createdOrder && (

            <div className="created-order">

              <h3>
                Order Created
              </h3>

              <p>
                Order Number:
                {" "}
                <strong>
                  {createdOrder.orderNumber}
                </strong>
              </p>

              <p>
                Order ID:
                {" "}
                <strong>
                  {createdOrder.orderId}
                </strong>
              </p>

              <p>
                Status:
                {" "}
                <strong>
                  {createdOrder.status}
                </strong>
              </p>


              {!materialCheck && (

                <button
                  type="button"
                  onClick={handleMaterialCheck}
                  disabled={checkingMaterials}
                >
                  {checkingMaterials
                    ? "Checking..."
                    : "Check Materials"}
                </button>

              )}

            </div>

          )}


          {materialCheck && (

            <div className="material-check">

              <div
                className={
                  materialCheck.canProduce
                    ? "material-success"
                    : "material-shortage"
                }
              >
                <strong>
                  {materialCheck.canProduce
                    ? "✓ Ready for Production"
                    : "✕ Material Shortage"
                  }
                </strong>
              </div>


              <div className="material-list">

                {materialCheck.materials.map(
                  (material) => (

                    <div
                      className="material-row"
                      key={material.componentId}
                    >

                      <div>
                        <strong>
                          {material.name}
                        </strong>

                        <small>
                          {material.sku}
                        </small>
                      </div>

                      <div className="material-numbers">

                        <span>
                          Required:
                          {" "}
                          {material.required}
                        </span>

                        <span>
                          Available:
                          {" "}
                          {material.available}
                        </span>

                        {material.shortage > 0 && (

                          <span className="shortage-number">
                            Shortage:
                            {" "}
                            {material.shortage}
                          </span>

                        )}

                      </div>

                    </div>

                  )
                )}

              </div>


              {materialCheck.canProduce && (

                <button
                  type="button"
                  onClick={handleStartProduction}
                  disabled={loading}
                >
                  {loading
                    ? "Starting..."
                    : "Start Production"
                  }
                </button>

              )}

            </div>

          )}

        </div>


        {!createdOrder && (

          <div className="modal-footer">

            <button
              type="button"
              className="secondary-button"
              onClick={handleClose}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={loading}
            >
              {loading
                ? "Creating..."
                : "Create Order"
              }
            </button>

          </div>

        )}

      </div>

    </div>
  );
}

export default CreateOrderModal;
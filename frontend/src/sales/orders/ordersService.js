import api from "@/api/api";

export const ordersService = {
  startProduction: (orderId, quantity, productId) =>
    api.post(`/orders/${orderId}/start-production`, {
      quantity,
      product_id: productId,
    }),
};

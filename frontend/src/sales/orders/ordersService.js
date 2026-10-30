import api from "@/api/api";

export const ordersService = {
  /** @param {{productId:number, quantity:number}[]} items */
  create: (items) => api.post("/orders", { items }),

  materialCheck: (orderId) =>
    api.get(`/orders/${orderId}/material-check`),

  productionCheck: (orderId, quantity, productId) =>
    api.get(`/orders/${orderId}/production-check`, {
      params: { quantity, product_id: productId },
    }),

  startProduction: (orderId, quantity, productId) =>
    api.post(`/orders/${orderId}/start-production`, {
      quantity,
      product_id: productId,
    }),
};
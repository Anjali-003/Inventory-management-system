import api from "@/api/api";

export const ordersService = {
  /** @param {{productId:number, quantity:number}[]} items */
  create: (items) => api.post("/orders", { items }),
  materialCheck: (orderId) => api.get(`/orders/${orderId}/material-check`),
  // an order can hold several products; production is started and tracked per product
  productionInfo: (orderId, productId) => api.get(`/orders/${orderId}/production-info`, { params: { product_id: productId } }),
  startProduction: (orderId, quantity, productId) => api.post(`/orders/${orderId}/start-production`, { quantity, product_id: productId }),
};

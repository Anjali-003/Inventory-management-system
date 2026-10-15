import api from "@/api/api";

export const ordersService = {
  /** @param {{productId:number, quantity:number}[]} items */
  create: (items) => api.post("/orders", { items }),
  materialCheck: (orderId) => api.get(`/orders/${orderId}/material-check`),
  productionInfo: (orderId) => api.get(`/orders/${orderId}/production-info`),
  productionCheck: (orderId, quantity) => api.get(`/orders/${orderId}/production-check`, { params: { quantity } }),
  startProduction: (orderId, quantity) => api.post(`/orders/${orderId}/start-production`, { quantity }),
};

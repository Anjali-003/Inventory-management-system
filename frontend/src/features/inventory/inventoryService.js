import api from "@/api/api";

/* Stock movements take an idempotency_key in `body`, so a double submit posts only once. */
export const inventoryService = {
  getItem: (id) => api.get(`/inventory/${id}`),
  getLedger: (params) => api.get("/inventory/ledger", { params }),
  searchComponents: (params) => api.get("/inventory/components", { params }),
  nextSku: () => api.get("/inventory/components/next-sku"),

  stockInBatch: (body) => api.post("/inventory/stock-in/batch", body),
  stockOut: (id, body) => api.post(`/inventory/${id}/stock-out`, body),
  update: (id, body) => api.put(`/inventory/${id}`, body),
  // Super Admin: standard cost per piece (used until the component is bought with a rate)
  setCost: (id, standardCost) => api.put(`/inventory/${id}/cost`, { standard_cost: standardCost }),
  archive: (id, reason) => api.delete(`/inventory/${id}`, { data: { reason } }),

  history: {
    monthly: () => api.get("/inventory/history"),
    daily: (month) => api.get("/inventory/history/daily", { params: { month } }),
    balance: () => api.get("/inventory/history/balance"),
    products: () => api.get("/inventory/history/products"),
  },
};

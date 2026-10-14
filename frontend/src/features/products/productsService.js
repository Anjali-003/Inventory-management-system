import api from "@/api/api";

export const productsService = {
  create: (body) => api.post("/products", body),
  nextSku: () => api.get("/products/next-sku"),
  importMany: (rows, dryRun) => api.post("/products/import", { rows, dryRun }),
  getBom: (productId) => api.get(`/products/${productId}/bom`),
  saveBom: (productId, lines) => api.put(`/products/${productId}/bom`, { lines }),
  importBom: (productId, body) => api.post(`/products/${productId}/bom/import`, body),
};

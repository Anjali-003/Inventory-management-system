import api from "@/api/api";

export const qualityControlService = {
  list: () => api.get("/quality-control"),
  getOne: (id) => api.get(`/quality-control/${id}`),
  decideBatch: (id, decision, remarks = "") => api.post(`/quality-control/${id}/decision`, { decision, remarks }),
};

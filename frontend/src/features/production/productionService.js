import api from "@/api/api";

export const productionService = {
  list: () => api.get("/production"),
  updateProgress: (id, quantity) => api.post(`/production/${id}/update-progress`, { quantity }),
};

import api from "@/api/api";

export const productionService = {
  list: () => api.get("/production"),
  updateProgress: (id, quantity) => api.post(`/production/${id}/update-progress`, { quantity }),
  startRework: (productionId) => api.post(`/production/${productionId}/rework/start`),
  submitRework: (productionId, remarks) => api.post(`/production/${productionId}/rework/submit`, { remarks }),
};

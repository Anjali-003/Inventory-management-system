import api from "@/api/api";

export const qcFailedService = {
  list: () => api.get("/qc-failed"),
  startRework: (productionId) => api.post(`/qc-failed/${productionId}/rework/start`),
  submitRework: (productionId, remarks) => api.post(`/qc-failed/${productionId}/rework/submit`, { remarks }),
};

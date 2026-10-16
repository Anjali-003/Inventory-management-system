import api from "@/api/api";

export const qualityControlService = {
  list: () => api.get("/quality-control"),
  getOne: (id) => api.get(`/quality-control/${id}`),
  saveTesting: (id, body) => api.post(`/quality-control/${id}/testing`, body),
  redoTesting: (id, body) => api.patch(`/quality-control/${id}/testing/redo`, body),
  redoQc: (id, body) => api.patch(`/quality-control/${id}/qc/redo`, body),
  saveQc: (id, body) => api.post(`/quality-control/${id}/qc`, body),
  decideBatch: (id, decision, remarks = "") => api.post(`/quality-control/${id}/decision`, { decision, remarks }),
};

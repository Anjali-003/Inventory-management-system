import api from "@/api/api";

export const finishedGoodsService = {
  list: () => api.get("/finished-goods"),
  dispatch: (id) => api.post(`/finished-goods/${id}/dispatch`),
  complete: (id) => api.post(`/finished-goods/${id}/complete`),
};

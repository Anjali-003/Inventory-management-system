import api from "@/api/api";

export const finishedGoodsService = {
  list: () => api.get("/finished-goods"),
  // action: pack | hand-over | receive | dispatch | deliver (each owned by one role, see fgFlow.js)
  step: (id, action, body = {}) => api.post(`/finished-goods/${id}/${action}`, body),
  createBill: (id, body) => api.post(`/finished-goods/${id}/bill`, body),
  getBill: (id) => api.get(`/finished-goods/${id}/bill`),
  addPayment: (id, body) => api.post(`/finished-goods/${id}/payments`, body),
  // Super Admin: cancel while the goods are in the Store, a credit note after they left
  cancelBill: (id, body) => api.post(`/finished-goods/${id}/bill/cancel`, body),
  creditNote: (id, body) => api.post(`/finished-goods/${id}/credit-note`, body),
};

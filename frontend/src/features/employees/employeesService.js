import api from "@/api/api";

export const employeesService = {
  list: () => api.get("/employees"),
  create: (form) => api.post("/employees", form),
  update: (id, form) => api.put(`/employees/${id}`, form),
  remove: (id) => api.delete(`/employees/${id}`),
};

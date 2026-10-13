import api from "@/api/api";

export const attendanceService = {
  /** @param {string} month "YYYY-MM" */
  monthlySummary: (month) => api.get("/attendance/summary", { params: { month } }),
};

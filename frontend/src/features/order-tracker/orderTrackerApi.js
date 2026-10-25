import { baseApi } from "@/api/baseApi";

/* Where every order is (and who it waits for), one order's whole journey, and the month report. Read only. */
export const orderTrackerApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTrackedOrders: build.query({
      query: () => ({ url: "/order-tracker" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["Orders", "OrderApprovals", "FinishedGoods", "Production", "Purchases"],
    }),
    getOrderJourney: build.query({
      query: (id) => ({ url: `/order-tracker/${id}` }),
      providesTags: ["Orders", "OrderApprovals", "FinishedGoods", "Production", "Purchases", "MaterialRequests", "QualityControl"],
    }),
    // Inventory History's balance: received - used = expected vs actual, and how the gap is explained
    getStockBalance: build.query({
      query: () => ({ url: "/inventory/history/balance" }),
      providesTags: ["Inventory", "FinishedGoods", "ExtraMaterials"],
    }),
    getMonthlyReport: build.query({
      query: (month) => ({ url: "/reports/monthly", params: { month } }),
      providesTags: ["Orders", "FinishedGoods", "Purchases", "QualityControl"],
    }),
  }),
});

export const { useGetTrackedOrdersQuery, useGetOrderJourneyQuery, useGetMonthlyReportQuery, useGetStockBalanceQuery } = orderTrackerApi;

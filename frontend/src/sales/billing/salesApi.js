import { baseApi } from "@/api/baseApi";

/* Marketing's Sales & Billing: every bill (paid / due) and the month's money. Bills change on the Finished Goods steps. */
export const salesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBills: build.query({
      query: () => ({ url: "/sales/bills" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["FinishedGoods", "Customers"],
    }),
    // payments received in a month (default: this month)
    getPayments: build.query({
      query: (month) => ({ url: "/sales/payments", params: month ? { month } : {} }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["FinishedGoods"],
    }),
    getSalesSummary: build.query({
      query: (month) => ({ url: "/sales/summary", params: month ? { month } : {} }),
      providesTags: ["FinishedGoods"],
    }),
  }),
});

export const { useGetBillsQuery, useGetPaymentsQuery, useGetSalesSummaryQuery } = salesApi;

import { baseApi } from "@/api/baseApi";

/*
  GET /orders returns one row per order LINE (not per order).
  Used by: Orders page, Dashboard, stock-out dialog.
*/
export const ordersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getOrders: build.query({
      query: () => ({ url: "/orders" }),
      providesTags: ["Orders"],
    }),
  }),
});

export const { useGetOrdersQuery } = ordersApi;

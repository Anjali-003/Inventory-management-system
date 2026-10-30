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

    /*
      How many units of one order line can start production now (materials allotted by Store minus what is
      already started). Used by: both "Start production" dialogs.
    */
    getProductionInfo: build.query({
      query: (orderItemId) => ({ url: `/orders/${orderItemId}/production-info` }),
      providesTags: ["Orders", "Production", "MaterialRequests"],
    }),
  }),
});

export const { useGetOrdersQuery, useGetProductionInfoQuery } = ordersApi;

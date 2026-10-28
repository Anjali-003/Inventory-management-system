import { baseApi } from "@/api/baseApi";

/*
  Marketing Manager: save an order as a draft, then send it to the Operations Admin.
  GET /marketing-orders returns one row per order with its product lines in `items`.
*/
const asList = (res) => (Array.isArray(res) ? res : []);

export const marketingOrdersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMarketingOrders: build.query({
      query: () => ({ url: "/marketing-orders" }),
      transformResponse: asList,
      providesTags: ["MarketingOrders"],
    }),
    // product picker (the /products endpoint is not open to the marketing role)
    getMarketingProducts: build.query({
      query: () => ({ url: "/marketing-orders/products" }),
      transformResponse: asList,
    }),
    // the saved customers, for the New order picker
    getMarketingCustomers: build.query({
      query: () => ({ url: "/marketing-orders/customers" }),
      providesTags: ["MarketingOrders"],
    }),
    createMarketingOrder: build.mutation({
      query: (data) => ({ url: "/marketing-orders", method: "post", data }),
      invalidatesTags: ["MarketingOrders"],
    }),
    sendMarketingOrder: build.mutation({
      query: (id) => ({ url: `/marketing-orders/${id}/send`, method: "post" }),
      invalidatesTags: ["MarketingOrders", "OrderApprovals"],
    }),
    // agree to the reduced quantity the Operations Admin proposed: the order goes back to the admin's queue
    acceptOrderRevision: build.mutation({
      query: (id) => ({ url: `/marketing-orders/${id}/accept-revision`, method: "post" }),
      invalidatesTags: ["MarketingOrders", "OrderApprovals"],
    }),
    // do not agree to the reduced quantity: the order is cancelled and the admin is told
    declineOrderRevision: build.mutation({
      query: (id) => ({ url: `/marketing-orders/${id}/decline-revision`, method: "post" }),
      invalidatesTags: ["MarketingOrders", "OrderApprovals"],
    }),
    deleteMarketingOrder: build.mutation({
      query: (id) => ({ url: `/marketing-orders/${id}`, method: "delete" }),
      invalidatesTags: ["MarketingOrders"],
    }),
  }),
});

export const {
  useGetMarketingOrdersQuery,
  useGetMarketingProductsQuery,
  useGetMarketingCustomersQuery,
  useCreateMarketingOrderMutation,
  useSendMarketingOrderMutation,
  useDeleteMarketingOrderMutation,
  useAcceptOrderRevisionMutation,
  useDeclineOrderRevisionMutation,
} = marketingOrdersApi;

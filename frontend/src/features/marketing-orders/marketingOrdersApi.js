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
    createMarketingOrder: build.mutation({
      query: (data) => ({ url: "/marketing-orders", method: "post", data }),
      invalidatesTags: ["MarketingOrders"],
    }),
    sendMarketingOrder: build.mutation({
      query: (id) => ({ url: `/marketing-orders/${id}/send`, method: "post" }),
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
  useCreateMarketingOrderMutation,
  useSendMarketingOrderMutation,
  useDeleteMarketingOrderMutation,
} = marketingOrdersApi;

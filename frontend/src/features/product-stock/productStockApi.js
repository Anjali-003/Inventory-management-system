import { baseApi } from "@/api/baseApi";

/* Finished products held by Store. Read only: it changes through the finished-goods steps (receive / give out). */
export const productStockApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProductStock: build.query({
      query: () => ({ url: "/product-stock" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["ProductStock"],
    }),
    getProductStockMovements: build.query({
      query: (productId) => ({ url: "/product-stock/movements", params: productId ? { product_id: productId } : {} }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["ProductStock"],
    }),
  }),
});

export const { useGetProductStockQuery, useGetProductStockMovementsQuery } = productStockApi;

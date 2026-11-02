import { baseApi } from "@/api/baseApi";

/* Used by: Products page and Dashboard. */
export const productsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProducts: build.query({
      query: () => ({ url: "/products" }),
      providesTags: ["Products"],
    }),
  }),
});

export const { useGetProductsQuery } = productsApi;

import { baseApi } from "@/api/baseApi";

/* Used by: Products page, Orders page (create-order dialog), Dashboard. */
export const productsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProducts: build.query({
      query: () => ({ url: "/products" }),
      providesTags: ["Products"],
    }),
  }),
});

export const { useGetProductsQuery } = productsApi;

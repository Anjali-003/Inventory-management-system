import { baseApi } from "@/api/baseApi";

/* Customers Marketing saved once and picks on the next bill. */
export const customersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCustomers: build.query({
      query: () => ({ url: "/customers" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["Customers"],
    }),
    saveCustomer: build.mutation({
      query: (body) => ({ url: "/customers", method: "post", data: body }),
      invalidatesTags: ["Customers"],
    }),
  }),
});

export const { useGetCustomersQuery, useSaveCustomerMutation } = customersApi;

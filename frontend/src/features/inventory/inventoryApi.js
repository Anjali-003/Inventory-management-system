import { baseApi } from "@/api/baseApi";

/*
  status: "active" | "archived" | "all"  (the backend defaults to "active").
  Dashboard and the Inventory page both ask for "active", so they share one cache entry.
*/
export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInventory: build.query({
      query: (status = "active") => ({ url: "/inventory", params: { status } }),
      providesTags: ["Inventory"],
    }),
  }),
});

export const { useGetInventoryQuery } = inventoryApi;

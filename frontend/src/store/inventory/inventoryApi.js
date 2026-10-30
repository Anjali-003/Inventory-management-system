import { baseApi } from "@/api/baseApi";

/*
  status: "active" | "archived" | "all"  (the backend defaults to "active").
  Dashboard and the Inventory page both ask for "active", so they share one cache entry.

  Everything here is tagged "Inventory": a stock movement (here or by another user, via LiveSync) refetches the list,
  an open item, the ledger and the history together.
*/
export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInventory: build.query({
      query: (status = "active") => ({ url: "/inventory", params: { status } }),
      providesTags: ["Inventory"],
    }),

    // one item with its recent movements (item detail dialog)
    getInventoryItem: build.query({
      query: (id) => ({ url: `/inventory/${id}` }),
      providesTags: ["Inventory"],
    }),

    // { page, page_size, q, direction, type, from, to, component_id } -> { rows, total, total_in, total_out }
    getInventoryLedger: build.query({
      query: (params) => ({ url: "/inventory/ledger", params }),
      providesTags: ["Inventory"],
    }),

    // type-ahead component picker: { q, limit } -> { rows, total }
    searchComponents: build.query({
      query: (params) => ({ url: "/inventory/components", params }),
      providesTags: ["Inventory"],
    }),

    // Inventory History page: month by month receipts, the balance sheet, finished products
    getInventoryHistory: build.query({
      query: () => ({ url: "/inventory/history" }),
      providesTags: ["Inventory"],
    }),
    getInventoryBalance: build.query({
      query: () => ({ url: "/inventory/history/balance" }),
      providesTags: ["Inventory"],
    }),
    getFinishedProductHistory: build.query({
      query: () => ({ url: "/inventory/history/products" }),
      providesTags: ["Inventory"],
    }),
  }),
});

export const {
  useGetInventoryQuery,
  useGetInventoryItemQuery,
  useGetInventoryLedgerQuery,
  useSearchComponentsQuery,
  useGetInventoryHistoryQuery,
  useGetInventoryBalanceQuery,
  useGetFinishedProductHistoryQuery,
} = inventoryApi;

import { baseApi } from "@/api/baseApi";

const asList = (value) => Array.isArray(value) ? value : [];
export const repairsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRepairs: build.query({ query: () => ({ url: "/repairs" }), transformResponse: asList, providesTags: ["Repairs"] }),
    getRepairProducts: build.query({ query: () => ({ url: "/repairs/products" }), transformResponse: asList, providesTags: ["Products"] }),
    createRepair: build.mutation({ query: (data) => ({ url: "/repairs", method: "post", data }), invalidatesTags: ["Repairs", "Notifications"] }),
    decideRepair: build.mutation({ query: ({ id, ...data }) => ({ url: `/repairs/${id}/decision`, method: "post", data }), invalidatesTags: ["Repairs", "Notifications"] }),
    updateRepairProgress: build.mutation({ query: ({ id, ...data }) => ({ url: `/repairs/${id}/progress`, method: "post", data }), invalidatesTags: ["Repairs", "Notifications"] }),
    inspectRepair: build.mutation({ query: ({ id, ...data }) => ({ url: `/repairs/${id}/qc`, method: "post", data }), invalidatesTags: ["Repairs", "Notifications"] }),
    dispatchRepair: build.mutation({ query: ({ id, ...data }) => ({ url: `/repairs/${id}/dispatch`, method: "post", data }), invalidatesTags: ["Repairs", "Notifications"] }),
  }),
});
export const {
  useGetRepairsQuery, useGetRepairProductsQuery, useCreateRepairMutation,
  useDecideRepairMutation, useUpdateRepairProgressMutation, useInspectRepairMutation, useDispatchRepairMutation,
} = repairsApi;

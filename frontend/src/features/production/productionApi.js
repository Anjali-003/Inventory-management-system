import { baseApi } from "@/api/baseApi";

/* Production runs. Refetched live when production or orders change (see realtime/LiveSync.jsx). */
export const productionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProduction: build.query({
      query: () => ({ url: "/production" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["Production"],
    }),
  }),
});

export const { useGetProductionQuery } = productionApi;

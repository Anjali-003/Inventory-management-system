import { baseApi } from "@/api/baseApi";

/* Approved batches (packaging -> dispatched -> completed). Refetched live when finished goods or orders change. */
export const finishedGoodsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getFinishedGoods: build.query({
      query: () => ({ url: "/finished-goods" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["FinishedGoods"],
    }),
  }),
});

export const { useGetFinishedGoodsQuery } = finishedGoodsApi;

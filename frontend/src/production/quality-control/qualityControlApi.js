import { baseApi } from "@/api/baseApi";

/* QC queue. Refetched live when quality control, production or orders change. */
export const qualityControlApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getQualityControl: build.query({
      query: () => ({ url: "/quality-control" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["QualityControl"],
    }),
  }),
});

export const { useGetQualityControlQuery } = qualityControlApi;

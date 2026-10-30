import { baseApi } from "@/api/baseApi";

/* Newest first. { limit } rows (server caps it at 200). Invalidated live whenever any super admin does something. */
export const activityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getActivity: build.query({
      query: ({ limit = 30 } = {}) => ({ url: "/activity", params: { limit } }),
      providesTags: ["Activity"],
    }),
  }),
});

export const { useGetActivityQuery } = activityApi;

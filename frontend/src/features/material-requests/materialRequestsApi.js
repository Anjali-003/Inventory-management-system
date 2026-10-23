import { baseApi } from "@/api/baseApi";

export const materialRequestsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMaterialRequests: build.query({
      query: () => ({ url: "/material-requests" }),
      transformResponse: (response) => (Array.isArray(response) ? response : []),
      providesTags: ["MaterialRequests"],
    }),
    getMaterialRequestOptions: build.query({
      query: (orderItemId) => ({ url: `/material-requests/options/${orderItemId}` }),
      providesTags: ["MaterialRequests"],
    }),
    createMaterialRequest: build.mutation({
      query: (body) => ({ url: "/material-requests", method: "post", data: body }),
      invalidatesTags: ["MaterialRequests", "Production"],
    }),
    issueMaterialRequest: build.mutation({
      query: ({ id, ...body }) => ({ url: `/material-requests/${id}/issue`, method: "post", data: body }),
      invalidatesTags: ["MaterialRequests", "Production"],
    }),
  }),
});

export const {
  useGetMaterialRequestsQuery,
  useGetMaterialRequestOptionsQuery,
  useCreateMaterialRequestMutation,
  useIssueMaterialRequestMutation,
} = materialRequestsApi;

import { baseApi } from "@/api/baseApi";

/* Extra components for pieces damaged in production: Production asks with a reason, Store issues or rejects. */
export const extraMaterialsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getExtraMaterials: build.query({
      query: () => ({ url: "/extra-materials" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["ExtraMaterials"],
    }),
    getExtraMaterialOptions: build.query({
      query: () => ({ url: "/extra-materials/options" }),
      transformResponse: (res) => (Array.isArray(res) ? res : []),
      providesTags: ["ExtraMaterials"],
    }),
    askExtraMaterial: build.mutation({
      query: (body) => ({ url: "/extra-materials", method: "post", data: body }),
      invalidatesTags: ["ExtraMaterials"],
    }),
    decideExtraMaterial: build.mutation({
      query: ({ id, decision, note }) => ({ url: `/extra-materials/${id}/${decision}`, method: "post", data: { note } }),
      invalidatesTags: ["ExtraMaterials", "Inventory"],
    }),
  }),
});

export const {
  useGetExtraMaterialsQuery,
  useGetExtraMaterialOptionsQuery,
  useAskExtraMaterialMutation,
  useDecideExtraMaterialMutation,
} = extraMaterialsApi;

// same codes as backend extra-material.service.js
export const EXTRA_REASONS = [
  ["DAMAGED", "Piece damaged during production"],
  ["PRODUCTION_WASTAGE", "Material wasted during production"],
  ["REWORK", "Rework after a QC fail"],
];

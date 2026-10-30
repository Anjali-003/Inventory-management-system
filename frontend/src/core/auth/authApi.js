import { baseApi } from "@/api/baseApi";

/* The logged-in user of this tab ({ id, name, email, role, created_at }): dashboard greeting, "You" in the activity
   feed, the profile menu. changePassword changes that user's own password. */
export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query({
      query: () => ({ url: "/auth/me" }),
      transformResponse: (res) => res.user,
      providesTags: ["Me"],
    }),
    changePassword: build.mutation({
      query: (body) => ({ url: "/auth/change-password", method: "post", data: body }),
    }),
  }),
});

export const { useGetMeQuery, useChangePasswordMutation } = authApi;

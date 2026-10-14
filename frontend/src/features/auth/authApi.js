import { baseApi } from "@/api/baseApi";

/* The logged-in super admin ({ id, name, email, role }). Used for the dashboard greeting and "You" in the activity feed. */
export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query({
      query: () => ({ url: "/auth/me" }),
      transformResponse: (res) => res.user,
      providesTags: ["Me"],
    }),
  }),
});

export const { useGetMeQuery } = authApi;

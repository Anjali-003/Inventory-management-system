import { baseApi } from "@/api/baseApi";

/*
  Dashboard notifications for the logged-in role (today: the Store Manager's "issue these components" requests).
  The backend saves one when an order is approved / dispatched and pushes a live event only after that
  transaction committed; LiveSync then invalidates the "Notifications" tag so the dashboard list refreshes.
*/
const asList = (res) => (Array.isArray(res) ? res : []);

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query({
      query: () => ({ url: "/notifications" }),
      transformResponse: asList,
      providesTags: ["Notifications"],
    }),
    markNotificationDone: build.mutation({
      query: (id) => ({ url: `/notifications/${id}/done`, method: "post" }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

export const { useGetNotificationsQuery, useMarkNotificationDoneMutation } = notificationsApi;

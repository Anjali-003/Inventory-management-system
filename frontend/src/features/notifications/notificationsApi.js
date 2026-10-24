import { baseApi } from "@/api/baseApi";

/*
  Notification inbox of the logged-in role (header bell + dashboard panels).
  GET /notifications -> { items, unread }. Every item: { id, type, title, body, severity, link, requires_action,
  read, done, created_at, ...payload }. Read state is per user; a task (requires_action) is done for the whole role.
  The backend pushes a live "notify" event after its transaction committed; LiveSync then invalidates "Notifications".
*/
const EMPTY = { items: [], unread: 0 };
const asInbox = (res) => (res && Array.isArray(res.items) ? res : EMPTY);

// mark as read in the cached list at once, so the bell reacts before the server answers
const readLocally = (dispatch, ids) =>
  dispatch(
    notificationsApi.util.updateQueryData("getNotifications", undefined, (draft) => {
      for (const n of draft.items) {
        if ((ids === "all" || ids.includes(n.id)) && !n.read) {
          n.read = true;
          draft.unread = Math.max(0, draft.unread - 1);
        }
      }
    })
  );

async function optimistic(ids, { dispatch, queryFulfilled }) {
  const patch = readLocally(dispatch, ids);
  try {
    await queryFulfilled;
  } catch {
    patch.undo();
  }
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query({
      query: () => ({ url: "/notifications" }),
      transformResponse: asInbox,
      providesTags: ["Notifications"],
    }),
    markNotificationRead: build.mutation({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "post" }),
      onQueryStarted: (id, api) => optimistic([id], api),
    }),
    markAllNotificationsRead: build.mutation({
      query: () => ({ url: "/notifications/read-all", method: "post" }),
      onQueryStarted: (_, api) => optimistic("all", api),
    }),
    // close a task (requires_action) for everyone of the role
    markNotificationDone: build.mutation({
      query: (id) => ({ url: `/notifications/${id}/done`, method: "post" }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationDoneMutation,
} = notificationsApi;

import { createApi } from "@reduxjs/toolkit/query/react";
import api from "@/api/api";

/*
  RTK Query talks to the backend through the SAME axios instance as the rest of the app
  (cookies, baseURL and the VITE_DATA_MODE=mock adapter all keep working).

  Errors are returned in the shape the pages already read from an axios error
  (err.response.data.message / err.code), so errorMessage() and existing catch blocks work unchanged.
*/
const axiosBaseQuery = () => async ({ url, method = "get", data, params }) => {
  try {
    const res = await api.request({ url, method, data, params });
    return { data: res.data };
  } catch (err) {
    return {
      error: {
        response: err.response ? { status: err.response.status, data: err.response.data } : undefined,
        code: err.code,
        message: err.message,
      },
    };
  }
};

/*
  One cache for the whole app. Features add their own endpoints with baseApi.injectEndpoints()
  (see the *Api.js file in each feature folder), so any component on any page can just call the hook it needs.

  refetchOnMountOrArgChange: cached data is shown immediately, but every screen that mounts still
  revalidates it, so stock levels / order statuses are never stale after you come back to a page.
*/
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Orders", "Products", "Inventory", "Attendance", "Me", "Activity"],
  refetchOnMountOrArgChange: true,
  endpoints: () => ({}),
});

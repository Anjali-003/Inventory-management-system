import { baseApi } from "@/api/baseApi";

/* Employee list. Refetched live when employees change. */
export const employeesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getEmployees: build.query({
      query: () => ({ url: "/employees" }),
      providesTags: ["Employees"],
    }),
  }),
});

export const { useGetEmployeesQuery } = employeesApi;

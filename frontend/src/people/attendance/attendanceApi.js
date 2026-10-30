import { baseApi } from "@/api/baseApi";

/* date: "YYYY-MM-DD". Used by: Attendance daily sheet and the Dashboard (today). */
export const attendanceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAttendance: build.query({
      query: (date) => ({ url: "/attendance", params: { date } }),
      providesTags: ["Attendance"],
    }),

    /*
      action: "check-in" | "check-out" | "half-day" | "mark".
      On success the one employee's row in the cached sheet is patched in place
      (no refetch), exactly like the page used to do with setRows().
    */
    markAttendance: build.mutation({
      query: ({ action, employeeId, date, status, time }) => ({
        url: `/attendance/${action}`,
        method: "post",
        data: { employeeId, date, status, time },
      }),
      async onQueryStarted({ employeeId, date }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            attendanceApi.util.updateQueryData("getAttendance", date, (rows) => {
              const row = rows.find((e) => e.employee_id === employeeId);
              if (row) {
                row.status = data.status;
                row.check_in = data.check_in;
                row.check_out = data.check_out;
                row.marked_at = data.marked_at;
              }
            }),
          );
        } catch {
          // the caller handles the error through unwrap()
        }
      },
    }),

    /* month: "YYYY-MM" -> one row per employee with the month's present / absent / half-day / leave counts. */
    getAttendanceSummary: build.query({
      query: (month) => ({ url: "/attendance/summary", params: { month } }),
      providesTags: ["Attendance"],
    }),
  }),
});

export const { useGetAttendanceQuery, useMarkAttendanceMutation, useGetAttendanceSummaryQuery } = attendanceApi;

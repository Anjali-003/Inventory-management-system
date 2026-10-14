import { useCallback } from "react";
import { useGetEmployeesQuery } from "@/features/employees/employeesApi";

/*
  The employee list (cached by RTK Query, refetched live when employees change).
  load()   -> refetch quietly (used after a save / delete)
  reload() -> same, used by the error banner's Retry button
*/
export default function useEmployees() {
  const { data, isLoading, isFetching, isError, refetch } = useGetEmployeesQuery();

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    employees: data ?? [],
    loading: isLoading || (isFetching && !data),
    error: isError ? "Could not load employees. Check that the server is running." : "",
    load,
    reload: load,
  };
}

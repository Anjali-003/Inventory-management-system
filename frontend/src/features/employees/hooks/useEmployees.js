import { useCallback, useEffect, useState } from "react";
import api from "@/api/api";
import useLiveRefresh from "@/realtime/useLiveRefresh";

/*
  Loads the employee list.
  load()   -> refetch quietly (used after a save / delete)
  reload() -> show the loading skeleton first (used by the error banner's Retry button)
*/
export default function useEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/employees");
      setEmployees(data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Could not load employees. Check that the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(["employees"], load);

  return { employees, loading, error, load, reload };
}

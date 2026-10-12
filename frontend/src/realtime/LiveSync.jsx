import { useEffect } from "react";
import { useDispatch } from "react-redux";
import api, { isMock } from "@/api/api";
import { baseApi } from "@/api/baseApi";

/*
  One SSE connection per logged-in browser tab (GET /api/events).
  When any super admin changes something, the backend sends { resource }.
    1) RTK Query screens (Dashboard, Orders, Products, Inventory, Attendance): matching tags are invalidated,
       so only the queries currently on screen refetch.
    2) Screens that use plain axios (Production, QC, Finished goods, Employees) listen through useLiveRefresh().
*/
const TAGS = {
  products: ["Products"],
  components: ["Products", "Inventory"],
  inventory: ["Inventory"],
  orders: ["Orders", "Inventory"],
  production: ["Orders", "Inventory"],
  "quality-control": ["Orders", "Inventory"],
  "finished-goods": ["Orders"],
  employees: ["Attendance"],
  attendance: ["Attendance"],
};

export const LIVE_EVENT = "ims:change";

export default function LiveSync() {
  const dispatch = useDispatch();

  useEffect(() => {
    if (isMock || typeof EventSource === "undefined") return;

    const pending = new Set();
    let timer = null;

    // several changes in a burst (e.g. one order touches 10 stock rows) -> one refetch
    const flush = () => {
      timer = null;
      const resources = [...pending];
      pending.clear();
      const tags = [...new Set(resources.flatMap((r) => TAGS[r] || []))];
      if (tags.length) dispatch(baseApi.util.invalidateTags(tags));
      window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: { resources } }));
    };

    const es = new EventSource(`${api.defaults.baseURL}/events`, { withCredentials: true });

    es.addEventListener("change", (e) => {
      try {
        pending.add(JSON.parse(e.data).resource);
        if (!timer) timer = setTimeout(flush, 200);
      } catch { /* ignore malformed event */ }
    });

    // this account was deactivated by another super admin
    es.addEventListener("logout", () => {
      es.close();
      window.location.href = "/login";
    });

    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [dispatch]);

  return null;
}

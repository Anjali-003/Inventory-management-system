import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import api, { isMock } from "@/api/api";
import { baseApi } from "@/api/baseApi";
import { useGetMeQuery } from "@/features/auth/authApi";
import { useToast } from "@/components/toast";

/*
  One SSE connection per logged-in browser tab (GET /api/events).
  When any super admin changes something, the backend sends { resource, actorId, activity }.
    1) RTK Query screens (Dashboard, Orders, Products, Inventory, Attendance, Activity): matching tags are
       invalidated, so only the queries currently on screen refetch.
    2) Screens that use plain axios (Production, QC, Finished goods, Employees) listen through useLiveRefresh().
    3) If ANOTHER super admin did it, a small toast tells you who did what.
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
  const toast = useToast();
  const { data: me } = useGetMeQuery();

  // refs so the stream is not reopened when these change
  const meRef = useRef(null);
  const toastRef = useRef(toast);
  meRef.current = me;
  toastRef.current = toast;

  useEffect(() => {
    if (isMock || typeof EventSource === "undefined") return;

    const pending = new Set();
    let sawActivity = false;
    let timer = null;

    // several changes in a burst (e.g. one order touches 10 stock rows) -> one refetch
    const flush = () => {
      timer = null;
      const resources = [...pending];
      pending.clear();
      const tags = new Set(resources.flatMap((r) => TAGS[r] || []));
      if (sawActivity) tags.add("Activity");
      sawActivity = false;
      if (tags.size) dispatch(baseApi.util.invalidateTags([...tags]));
      window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: { resources } }));
    };

    const es = new EventSource(`${api.defaults.baseURL}/events`, { withCredentials: true });

    es.addEventListener("change", (e) => {
      try {
        const evt = JSON.parse(e.data);
        pending.add(evt.resource);

        if (evt.activity) {
          sawActivity = true;
          const myId = meRef.current?.id;
          if (myId && evt.actorId !== myId) {
            toastRef.current.success(`${evt.activity.user_name}: ${evt.activity.summary}`);
          }
        }

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

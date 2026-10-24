//LiveSync.jsx doosre users ke changes ka pata lagata hai aur data refresh karwata hai.
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import api, { isMock } from "@/api/api";
import { baseApi } from "@/api/baseApi";
import { notificationsApi } from "@/features/notifications/notificationsApi";
import { useGetMeQuery } from "@/features/auth/authApi";
import { useToast } from "@/components/toast";
import { getActiveRole, loginPathFor } from "@/lib/permissions";

/*
  One SSE connection per logged-in browser tab (GET /api/v1/events).
  When anyone changes something, the backend sends { resource, actorId, activity }.
    1) The cache tags that resource affects are invalidated, so only the RTK Query lists currently on
       screen refetch (every list screen uses RTK Query, see features/<name>/<name>Api.js).
    2) If ANOTHER user did it, a small toast tells you who did what.

  TAGS: backend resource name -> RTK Query tags to refetch. Add a line here when a new screen should
  refresh live.
*/
const TAGS = {
  products: ["Products"],
  components: ["Products", "Inventory"],
  inventory: ["Inventory"],
  orders: ["Orders", "Inventory", "Production", "FinishedGoods", "QualityControl"],
  production: ["Orders", "Inventory", "Production", "QualityControl"],
  "qc-failed": ["Production", "QualityControl", "FinishedGoods", "Orders"],
  "quality-control": ["Orders", "Inventory", "QualityControl"],
  "finished-goods": ["Orders", "FinishedGoods"],
  employees: ["Attendance", "Employees"],
  attendance: ["Attendance"],
  // incoming goods: purchase -> IQC -> store. Accepting also changes stock.
  purchase: ["Purchases", "OrderApprovals"], // placing a purchase marks lines of the approved order as ordered
  iqc: ["Purchases"],
  "incoming-stock": ["Purchases", "Inventory"],
  // order approval: both screens (Operations Admin + Purchase Manager) and the Orders page refresh together
  "order-approvals": ["OrderApprovals", "Orders", "MarketingOrders", "Production", "Purchases", "Inventory"],
  "marketing-orders": ["MarketingOrders", "OrderApprovals", "Orders"],
  "approved-orders": ["OrderApprovals"],
  "material-requests": ["MaterialRequests", "Production"],
};

// notification type -> extra tags to refetch with the bell (the screens that notification is about)
const NOTIFY_TAGS = {
  ORDER_SENT: ["OrderApprovals"],
  ORDER_APPROVED: ["MarketingOrders", "Orders"],
  ORDER_REJECTED: ["MarketingOrders", "Orders"],
  QUANTITY_REVISED: ["MarketingOrders"],
  REVISION_ACCEPTED: ["OrderApprovals"],
  DELIVERY_DATE_CHANGED: ["MarketingOrders"],
  PRODUCTION_ASSIGNED: ["Production", "MaterialRequests"],
  PURCHASE_REQUIRED: ["OrderApprovals", "Purchases"],
  PURCHASE_SENT_TO_IQC: ["Purchases"],
  IQC_RESULT: ["Purchases"],
  PURCHASE_READY_FOR_STORE: ["Purchases"],
  PURCHASE_STORED: ["Purchases", "Inventory", "OrderApprovals"],
  ISSUE_COMPONENTS: ["Inventory"],
  MATERIAL_REQUESTED: ["MaterialRequests", "Inventory"],
  MATERIAL_ISSUED: ["MaterialRequests", "Production"],
  BATCH_READY_FOR_QC: ["QualityControl", "Production"],
  QC_PASSED: ["Production", "QualityControl", "FinishedGoods"],
  QC_FAILED: ["Production", "QualityControl"],
  REWORK_SUBMITTED: ["QualityControl"],
  ORDER_DISPATCHED: ["MarketingOrders", "FinishedGoods", "Orders"],
};

export default function LiveSync() {
  const dispatch = useDispatch();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();

  // refs so the stream is not reopened when these change
  const meRef = useRef(null);
  const toastRef = useRef(toast);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    meRef.current = me;
    toastRef.current = toast;
    navigateRef.current = navigate;
  });

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
    };

    // EventSource cannot send headers, so the tab's role travels in the query string
    const role = getActiveRole();
    const es = new EventSource(`${api.defaults.baseURL}/events?role=${encodeURIComponent(role || "")}`, { withCredentials: true });

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

    // targeted notification (sent by the backend only after its DB transaction committed).
    // A new one carries a title -> toast (with "Open" when it has a page); NOTIFICATIONS_CHANGED only refreshes the bell.
    es.addEventListener("notify", (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.title) {
          toastRef.current.notify({
            type: evt.type,
            title: evt.title,
            body: evt.body,
            severity: evt.severity,
            action: evt.link
              ? {
                  label: "Open",
                  onClick: () => {
                    navigateRef.current(evt.link);
                    if (evt.notificationId) dispatch(notificationsApi.endpoints.markNotificationRead.initiate(evt.notificationId));
                  },
                }
              : undefined,
          });
        } else if (evt.message) {
          // live-only events without a saved notification (e.g. material requests)
          toastRef.current.notify({ type: evt.type, title: evt.message, severity: "info" });
        }
        dispatch(baseApi.util.invalidateTags(["Notifications", ...(NOTIFY_TAGS[evt.type] || [])]));
      } catch { /* ignore malformed event */ }
    });

    // this account was deactivated by another super admin
    es.addEventListener("logout", () => {
      es.close();
      window.location.href = loginPathFor(role);
    });

    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [dispatch]);

  return null;
}

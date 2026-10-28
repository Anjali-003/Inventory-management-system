import { baseApi } from "@/api/baseApi";

/*
  Order approval:  order raised (marketing / super admin)  ->  Operations Admin approves or rejects
                   ->  approved orders appear for the Purchase Manager.

  Both screens read the same orders through their OWN endpoint (the backend checks the role on each one).
  One order = one row with its product lines in `items`. Refetched live (tag "OrderApprovals").
*/
const asList = (res) => (Array.isArray(res) ? res : []);

export const orderApprovalsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Operations Admin: every order with its approval status
    getOrderApprovals: build.query({
      query: () => ({ url: "/order-approvals" }),
      transformResponse: asList,
      providesTags: ["OrderApprovals"],
    }),
    // Purchase Manager: only the approved orders
    getApprovedOrders: build.query({
      query: () => ({ url: "/approved-orders" }),
      transformResponse: asList,
      providesTags: ["OrderApprovals"],
    }),
    // Operations Admin: what can be built from the stock available right now, and which components are short
    // for the rest. Computed by the backend (see backend/docs/ORDER_PLAN_API.md); re-fetched whenever stock changes.
    getOrderPlan: build.query({
      query: (id) => ({ url: `/order-approvals/${id}/plan` }),
      providesTags: ["OrderApprovals", "Inventory"],
    }),
    // Operations Admin: the decision only (Marketing is told). No stock moves and no list is sent.
    approveOrder: build.mutation({
      query: ({ id, ...data }) => ({ url: `/order-approvals/${id}/approve`, method: "post", data }),
      invalidatesTags: ["OrderApprovals", "Orders", "MarketingOrders"],
    }),
    // Operations Admin, on an approved order: what the stock can build now goes to Production (its stock is deducted)
    sendToProduction: build.mutation({
      query: ({ id, ...data }) => ({ url: `/order-approvals/${id}/send-to-production`, method: "post", data }),
      invalidatesTags: ["OrderApprovals", "Orders", "Production", "Inventory"],
    }),
    // Operations Admin, on an approved order: the components that are short go to Purchase (once per order)
    sendToPurchase: build.mutation({
      query: ({ id, ...data }) => ({ url: `/order-approvals/${id}/send-to-purchase`, method: "post", data }),
      invalidatesTags: ["OrderApprovals", "Purchases"],
    }),
    updateDeliveryDate: build.mutation({
      query: ({ id, ...data }) => ({ url: `/order-approvals/${id}/delivery-date`, method: "patch", data }),
      invalidatesTags: ["OrderApprovals", "MarketingOrders", "Orders"],
    }),
    // Operations Admin: make only part of the order now. The rest goes back to Marketing as a new draft and the
    // order waits (QUANTITY_REVISED) until the Marketing Manager accepts the reduced quantity.
    reviseOrder: build.mutation({
      query: ({ id, ...data }) => ({ url: `/order-approvals/${id}/revise`, method: "post", data }),
      invalidatesTags: ["OrderApprovals", "MarketingOrders", "Orders"],
    }),
    // an APPROVED order that has not started production: its components go back into stock (reason required)
    cancelOrder: build.mutation({
      query: ({ id, remarks }) => ({ url: `/order-approvals/${id}/cancel`, method: "post", data: { remarks } }),
      invalidatesTags: ["OrderApprovals", "Orders", "MarketingOrders", "Production", "MaterialRequests", "Inventory"],
    }),
    rejectOrder: build.mutation({
      query: ({ id, remarks }) => ({ url: `/order-approvals/${id}/reject`, method: "post", data: { remarks } }),
      invalidatesTags: ["OrderApprovals", "Orders"],
    }),
  }),
});

export const {
  useGetOrderApprovalsQuery,
  useGetApprovedOrdersQuery,
  useGetOrderPlanQuery,
  useApproveOrderMutation,
  useSendToProductionMutation,
  useSendToPurchaseMutation,
  useRejectOrderMutation,
  useCancelOrderMutation,
  useReviseOrderMutation,
  useUpdateDeliveryDateMutation,
} = orderApprovalsApi;

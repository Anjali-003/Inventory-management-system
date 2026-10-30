import { baseApi } from "@/api/baseApi";

/*
  Incoming goods:  Purchase manager places order -> marks received -> sends to IQC  ->  IQC inspects  ->  Store manager accepts into stock.
  One purchase = one lot with several component lines. Each department reads the same purchases
  through its OWN endpoint (the backend checks the role on each one), so they always show the same numbers.

  Refetched live (tag "Purchases") whenever another department moves a purchase along.
*/
const asList = (res) => (Array.isArray(res) ? res : []);

export const purchasingApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // purchase manager: every purchase
    getPurchases: build.query({
      query: () => ({ url: "/purchase" }),
      transformResponse: asList,
      providesTags: ["Purchases"],
    }),
    // IQC manager: every purchase (the screen splits it into "to inspect" and "inspected")
    getIqcQueue: build.query({
      query: () => ({ url: "/iqc" }),
      transformResponse: asList,
      providesTags: ["Purchases"],
    }),
    // store manager: IQC-approved purchases waiting to be accepted + the ones already accepted
    getIncomingStock: build.query({
      query: () => ({ url: "/incoming-stock" }),
      transformResponse: asList,
      providesTags: ["Purchases"],
    }),

    // purchase manager: place a purchase order (PurchasePlanner).
    // data = { supplier, notes, items: [{ component_id, quantity, request_item_ids }] }: requirements of any approved
    // orders combined per component and/or components for stock, in round figures (never below what the covered
    // requirement lines need: the server checks). The older { order_id, request_item_ids } form still works.
    createPurchase: build.mutation({
      query: (data) => ({ url: "/purchase", method: "post", data }),
      invalidatesTags: ["Purchases", "OrderApprovals"],
    }),
    // purchase manager: goods arrived, with the pieces counted per component ({ id, items: [{ id, received }] })
    receivePurchase: build.mutation({
      query: ({ id, items }) => ({ url: `/purchase/${id}/receive`, method: "post", data: { items } }),
      invalidatesTags: ["Purchases"],
    }),
    // purchase manager: hand the received goods to IQC
    sendPurchaseToIqc: build.mutation({
      query: (id) => ({ url: `/purchase/${id}/send-to-iqc`, method: "post" }),
      invalidatesTags: ["Purchases"],
    }),
    inspectPurchase: build.mutation({
      query: ({ id, ...data }) => ({ url: `/iqc/${id}/inspect`, method: "post", data }),
      invalidatesTags: ["Purchases"],
    }),
    acceptPurchase: build.mutation({
      query: (id) => ({ url: `/incoming-stock/${id}/accept`, method: "post" }),
      invalidatesTags: ["Purchases", "Inventory"],
    }),
  }),
});

export const {
  useGetPurchasesQuery,
  useGetIqcQueueQuery,
  useGetIncomingStockQuery,
  useCreatePurchaseMutation,
  useReceivePurchaseMutation,
  useSendPurchaseToIqcMutation,
  useInspectPurchaseMutation,
  useAcceptPurchaseMutation,
} = purchasingApi;

/* eslint-disable react-refresh/only-export-components -- a route table: lazy page components, not components defined here */
/**
 * The app's page table: ONE place that lists every page, its URL and the permission module it needs.
 * To add a page: create features/<name>/<Name>.jsx and add one line here
 * (and a sidebar entry in components/Layout.jsx GROUPS, and the module in lib/permissions.js).
 * Pages are loaded on demand (React.lazy): opening one page never downloads the code of the others.
 * `title` is what the browser tab says on that page.
 */
import { lazy } from "react";

const Dashboard = lazy(() => import("@/features/dashboard/Dashboard"));
const Products = lazy(() => import("@/features/products/Products"));
const Inventory = lazy(() => import("@/features/inventory/Inventory"));
const InventoryHistory = lazy(() => import("@/features/inventory/InventoryHistory"));
const Orders = lazy(() => import("@/features/orders/Orders"));
const Production = lazy(() => import("@/features/production/Production"));
const QCFailed = lazy(() => import("@/features/production/QCFailed"));
const QualityControl = lazy(() => import("@/features/quality-control/QualityControl"));
const FinishedGoods = lazy(() => import("@/features/finished-goods/FinishedGoods"));
const Employees = lazy(() => import("@/features/employees/Employees"));
const Attendance = lazy(() => import("@/features/attendance/Attendance"));
const Activity = lazy(() => import("@/features/activity/Activity"));
const Iqc = lazy(() => import("@/features/iqc/Iqc"));
const Purchase = lazy(() => import("@/features/purchase/Purchase"));
const PurchaseRequests = lazy(() => import("@/features/purchase/PurchaseRequests"));
const IncomingStock = lazy(() => import("@/features/incoming-stock/IncomingStock"));
const MarketingOrders = lazy(() => import("@/features/marketing-orders/MarketingOrders"));
const OrderApprovals = lazy(() => import("@/features/order-approvals/OrderApprovals"));
const ApprovedOrders = lazy(() => import("@/features/approved-orders/ApprovedOrders"));
const StoreStatus = lazy(() => import("@/features/store-status/StoreStatus"));
const StoreMaterialRequests = lazy(() => import("@/features/material-requests/StoreMaterialRequests"));
const ProductStock = lazy(() => import("@/features/product-stock/ProductStock"));

/** { path, module (see MODULE_PATHS in lib/permissions.js), Page, title } */
//Page batata hai kya render karna hai, module batata hai kis permission ko check karna hai, aur path batata hai kis URL par route match karna hai.
export const PAGES = [
  { path: "/dashboard", module: "dashboard", Page: Dashboard, title: "Dashboard" },
  { path: "/inventory-history", module: "inventoryHistory", Page: InventoryHistory, title: "Inventory history" },
  { path: "/activity", module: "activity", Page: Activity, title: "Activity" },
  { path: "/orders", module: "orders", Page: Orders, title: "Orders" },
  { path: "/products", module: "products", Page: Products, title: "Products" },
  { path: "/inventory", module: "inventory", Page: Inventory, title: "Component stock" },
  { path: "/product-stock", module: "productStock", Page: ProductStock, title: "Product stock" },
  { path: "/production", module: "production", Page: Production, title: "Production" },
  { path: "/qc-failed", module: "qcFailed", Page: QCFailed, title: "QC failed batches" },
  { path: "/quality-control", module: "qualityControl", Page: QualityControl, title: "Quality control" },
  { path: "/finished-goods", module: "finishedGoods", Page: FinishedGoods, title: "Finished goods & dispatch" },
  { path: "/employees", module: "employees", Page: Employees, title: "Employees" },
  { path: "/attendance", module: "attendance", Page: Attendance, title: "Attendance" },
  { path: "/iqc", module: "iqc", Page: Iqc, title: "IQC" },
  { path: "/purchase", module: "purchase", Page: Purchase, title: "Purchase" },
  { path: "/purchase-requests", module: "purchase", Page: PurchaseRequests, title: "Purchase requests" },
  { path: "/incoming-stock", module: "incomingStock", Page: IncomingStock, title: "Receive from IQC" },
  { path: "/store-material-requests", module: "storeMaterialRequests", Page: StoreMaterialRequests, title: "Issue to production" },
  { path: "/marketing-orders", module: "marketingOrders", Page: MarketingOrders, title: "Marketing orders" },
  { path: "/order-approvals", module: "orderApprovals", Page: OrderApprovals, title: "Orders to approve" },
  { path: "/approved-orders", module: "approvedOrders", Page: ApprovedOrders, title: "Approved orders" },
  // the four Store dashboard figures in one place; needs the same access as the store pages it lists (see lib/permissions.js)
  { path: "/store-status", module: "inventory", Page: StoreStatus, title: "Store status" },
];

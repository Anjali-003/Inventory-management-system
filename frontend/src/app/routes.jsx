/* eslint-disable react-refresh/only-export-components -- a route table: lazy page components, not components defined here */
/**
 * The app's page table: ONE place that lists every page, its URL and the permission module it needs.
 * To add a page: create <department>/<feature>/<Name>.jsx and add one line here
 * (and a sidebar entry in components/Layout.jsx GROUPS, and the module in lib/permissions.js).
 * Pages are loaded on demand (React.lazy): opening one page never downloads the code of the others.
 * `title` is what the browser tab says on that page.
 */
import { lazy } from "react";

const Dashboard = lazy(() => import("@/core/dashboard/Dashboard"));
const Products = lazy(() => import("@/store/products/Products"));
const Inventory = lazy(() => import("@/store/inventory/Inventory"));
const InventoryHistory = lazy(() => import("@/store/inventory/InventoryHistory"));
const Orders = lazy(() => import("@/sales/orders/Orders"));
const Production = lazy(() => import("@/production/production/Production"));
const QCFailed = lazy(() => import("@/production/production/QCFailed"));
const QualityControl = lazy(() => import("@/production/quality-control/QualityControl"));
const FinishedGoods = lazy(() => import("@/production/finished-goods/FinishedGoods"));
const Employees = lazy(() => import("@/people/employees/Employees"));
const Attendance = lazy(() => import("@/people/attendance/Attendance"));
const Activity = lazy(() => import("@/core/activity/Activity"));
const Iqc = lazy(() => import("@/purchase/iqc/Iqc"));
const Purchase = lazy(() => import("@/purchase/purchase-orders/Purchase"));
const PurchaseRequests = lazy(() => import("@/purchase/purchase-orders/PurchaseRequests"));
const IncomingStock = lazy(() => import("@/purchase/incoming-stock/IncomingStock"));
const MarketingOrders = lazy(() => import("@/sales/marketing-orders/MarketingOrders"));
const OrderApprovals = lazy(() => import("@/sales/order-approvals/OrderApprovals"));
const ApprovedOrders = lazy(() => import("@/sales/approved-orders/ApprovedOrders"));
const StoreStatus = lazy(() => import("@/store/store-status/StoreStatus"));
const StoreMaterialRequests = lazy(() => import("@/store/material-requests/StoreMaterialRequests"));
const ProductStock = lazy(() => import("@/store/product-stock/ProductStock"));
const OrderTracker = lazy(() => import("@/core/order-tracker/OrderTracker"));
const Reports = lazy(() => import("@/core/order-tracker/Reports"));
const Bills = lazy(() => import("@/sales/billing/Bills"));
const ToBill = lazy(() => import("@/sales/billing/ToBill"));
const Customers = lazy(() => import("@/sales/billing/Customers"));
const RepairRequests = lazy(() => import("@/production/repairs/RepairRequests"));
const RepairApprovals = lazy(() => import("@/production/repairs/RepairApprovals"));
const RepairProduction = lazy(() => import("@/production/repairs/RepairProduction"));
const RepairQC = lazy(() => import("@/production/repairs/RepairQC"));
const RepairDispatch = lazy(() => import("@/production/repairs/RepairDispatch"));

/** { path, module (see MODULE_PATHS in lib/permissions.js), Page, title } */
//Page batata hai kya render karna hai, module batata hai kis permission ko check karna hai, aur path batata hai kis URL par route match karna hai.
export const PAGES = [
  { path: "/dashboard", module: "dashboard", Page: Dashboard, title: "Dashboard" },
  { path: "/inventory-history", module: "inventoryHistory", Page: InventoryHistory, title: "Inventory history" },
  { path: "/activity", module: "activity", Page: Activity, title: "Activity" },
  { path: "/order-tracker", module: "orderTracker", Page: OrderTracker, title: "Order tracker" },
  { path: "/reports", module: "reports", Page: Reports, title: "Reports" },
  { path: "/bills", module: "sales", Page: Bills, title: "Bills" },
  { path: "/to-bill", module: "sales", Page: ToBill, title: "To bill" },
  { path: "/customers", module: "customers", Page: Customers, title: "Customers" },
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
  { path: "/repair-requests", module: "repairRequests", Page: RepairRequests, title: "Repair requests" },
  { path: "/repair-approvals", module: "repairApprovals", Page: RepairApprovals, title: "Repair approvals" },
  { path: "/repair-production", module: "repairProduction", Page: RepairProduction, title: "Repair production" },
  { path: "/repair-qc", module: "repairQc", Page: RepairQC, title: "Repair QC" },
  { path: "/repair-dispatch", module: "repairDispatch", Page: RepairDispatch, title: "Repair dispatch" },
  { path: "/order-approvals", module: "orderApprovals", Page: OrderApprovals, title: "Orders to approve" },
  { path: "/approved-orders", module: "approvedOrders", Page: ApprovedOrders, title: "Approved orders" },
  // the four Store dashboard figures in one place; needs the same access as the store pages it lists (see lib/permissions.js)
  { path: "/store-status", module: "inventory", Page: StoreStatus, title: "Store status" },
];

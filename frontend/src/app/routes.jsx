/**
 * The app's page table: ONE place that lists every page, its URL and the permission module it needs.
 * To add a page: create features/<name>/<Name>.jsx and add one line here
 * (and a sidebar entry in components/Layout.jsx GROUPS, and the module in lib/permissions.js).
 */
import Dashboard from "@/features/dashboard/Dashboard";
import Products from "@/features/products/Products";
import Inventory from "@/features/inventory/Inventory";
import InventoryHistory from "@/features/inventory/InventoryHistory";
import Orders from "@/features/orders/Orders";
import Production from "@/features/production/Production";
import QualityControl from "@/features/quality-control/QualityControl";
import FinishedGoods from "@/features/finished-goods/FinishedGoods";
import Employees from "@/features/employees/Employees";
import Attendance from "@/features/attendance/Attendance";
import Activity from "@/features/activity/Activity";

/** { path, module (see MODULE_PATHS in lib/permissions.js), Page } */
export const PAGES = [
  { path: "/", module: "dashboard", Page: Dashboard },
  { path: "/inventory-history", module: "inventoryHistory", Page: InventoryHistory },
  { path: "/activity", module: "activity", Page: Activity },
  { path: "/orders", module: "orders", Page: Orders },
  { path: "/products", module: "products", Page: Products },
  { path: "/inventory", module: "inventory", Page: Inventory },
  { path: "/production", module: "production", Page: Production },
  { path: "/quality-control", module: "qualityControl", Page: QualityControl },
  { path: "/finished-goods", module: "finishedGoods", Page: FinishedGoods },
  { path: "/employees", module: "employees", Page: Employees },
  { path: "/attendance", module: "attendance", Page: Attendance },
];

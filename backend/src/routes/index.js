/**
 * The API route table: ONE place that lists every module, where it is mounted and who may use it.
 *
 *   { path, router, resource?, guards? }
 *     path      mount point below the API prefix            ("/orders" -> /api/v1/orders)
 *     router    the module's routes (<department>/<name>/<name>.routes.js)
 *     resource  name used by the activity feed + live refresh; omit to skip activity logging
 *     guards    extra middleware that runs after login, in order (permit(...), requireRole(...))
 *     public    true = no login needed (only /auth)
 *
 * To add a module: create <department>/<name>/{controller,service,routes}.js and add ONE entry below.
 */
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const broadcastChanges = require("../middleware/broadcastChanges");
const { permit } = require("../middleware/permissions");

const authRoutes = require("../core/auth/auth.routes");
const productRoutes = require("../store/products/product.routes");
const componentRoutes = require("../store/components/component.routes");
const inventoryRoutes = require("../store/inventory/inventory.routes");
const orderRoutes = require("../sales/orders/order.routes");
const productionRoutes = require("../production/production/production.routes");
const qcFailedRoutes = require("../production/production/qc-failed.routes");
const qualityControlRoutes = require("../production/quality-control/quality-control.routes");
const finishedGoodsRoutes = require("../production/finished-goods/finished-goods.routes");
const purchaseRoutes = require("../purchase/purchase-orders/purchase-order.routes");
const iqcRoutes = require("../purchase/iqc/iqc.routes");
const incomingStockRoutes = require("../purchase/incoming-stock/incoming-stock.routes");
const marketingOrderRoutes = require("../sales/marketing-orders/marketing-order.routes");
const repairRoutes = require("../production/repairs/repair.routes");
const orderApprovalRoutes = require("../sales/order-approvals/order-approval.routes");
const approvedOrdersRoutes = require("../sales/order-approvals/approved-orders.routes");
const employeeRoutes = require("../people/employees/employee.routes");
const attendanceRoutes = require("../people/attendance/attendance.routes");
const superAdminRoutes = require("../core/super-admins/super-admin.routes");
const activityRoutes = require("../core/activity/activity.routes");
const notificationRoutes = require("../core/notifications/notification.routes");
const pushRoutes = require("../core/push/push.routes");
const materialRequestRoutes = require("../store/material-requests/material-request.routes");
const extraMaterialRoutes = require("../store/extra-materials/extra-material.routes");
const productStockRoutes = require("../store/product-stock/product-stock.routes");
const customerRoutes = require("../sales/customers/customer.routes");
const reportRoutes = require("../core/reports/report.routes");
const salesRoutes = require("../sales/billing/billing.routes");
const orderTrackerRoutes = require("../core/reports/order-tracker.routes");
const eventsRoutes = require("../realtime/events.routes");

const MODULES = [
    // Public: users must be able to log in before authentication exists.
    { path: "/auth", router: authRoutes, public: true },

    { path: "/products", router: productRoutes, resource: "products", guards: [permit("products")] },
    { path: "/components", router: componentRoutes, resource: "components", guards: [permit("products")] },

    // permit() is applied per route inside inventory.routes.js (stock screens vs history screen)
    { path: "/inventory", router: inventoryRoutes, resource: "inventory" },

    { path: "/orders", router: orderRoutes, resource: "orders" },
    { path: "/production", router: productionRoutes, resource: "production", guards: [permit("production")] },
    { path: "/material-requests", router: materialRequestRoutes, resource: "material-requests", guards: [permit("materialRequests")] },
    // extra components for pieces damaged in production: Production asks (with a reason), Store issues
    { path: "/extra-materials", router: extraMaterialRoutes, resource: "extra-materials", guards: [permit("materialRequests")] },
    { path: "/qc-failed", router: qcFailedRoutes, resource: "qc-failed", guards: [permit("qcFailed")] },
    { path: "/quality-control", router: qualityControlRoutes, resource: "quality-control", guards: [permit("qualityControl")] },

    // QC PASS -> packed (QC & FG) -> handed over (Ops Admin) -> in store (Store) -> billed (Marketing)
    //         -> dispatched (Store) -> delivered (Marketing). Each step checks its owner role in finished-goods.routes.js
    { path: "/finished-goods", router: finishedGoodsRoutes, resource: "finished-goods", guards: [permit("finishedGoods")] },
    // finished products held by Store (read only; it changes through the finished-goods steps)
    { path: "/product-stock", router: productStockRoutes, resource: "product-stock", guards: [permit("productStock")] },
    // customers saved by Marketing and picked on the bill
    { path: "/customers", router: customerRoutes, resource: "customers", guards: [permit("customers")] },
    // read only: where every order is and its whole journey; the month report
    { path: "/order-tracker", router: orderTrackerRoutes, guards: [permit("orderTracker")] },
    { path: "/reports", router: reportRoutes, guards: [permit("reports")] },
    // Marketing's Sales & Billing: every bill with paid / due, and the month's money (read only)
    { path: "/sales", router: salesRoutes, guards: [permit("sales")] },

    // Incoming goods:  Purchase manager buys -> IQC inspects -> Store manager accepts into stock
    { path: "/purchase", router: purchaseRoutes, resource: "purchase", guards: [permit("purchase")] },
    { path: "/iqc", router: iqcRoutes, resource: "iqc", guards: [permit("iqc")] },
    { path: "/incoming-stock", router: incomingStockRoutes, resource: "incoming-stock", guards: [permit("incomingStock")] },

    // Order approval:  order raised -> Operations Admin approves / rejects -> approved orders go to the Purchase Manager
    { path: "/marketing-orders", router: marketingOrderRoutes, resource: "marketing-orders", guards: [permit("marketingOrders")] },
    // Customer repairs use their own records and statuses; normal orders/production/QC are untouched.
    { path: "/repairs", router: repairRoutes, resource: "repairs", guards: [permit("repairs")] },
    { path: "/order-approvals", router: orderApprovalRoutes, resource: "order-approvals", guards: [permit("orderApprovals")] },
    { path: "/approved-orders", router: approvedOrdersRoutes, resource: "approved-orders", guards: [permit("approvedOrders")] },

    { path: "/employees", router: employeeRoutes, resource: "employees", guards: [permit("employees")] },
    { path: "/attendance", router: attendanceRoutes, resource: "attendance", guards: [permit("attendance")] },

    // super admins only (requireRole is also applied inside super-admin.routes.js)
    { path: "/super-admins", router: superAdminRoutes, resource: "super-admins" },
    { path: "/activity", router: activityRoutes, guards: [requireRole("SUPER_ADMIN", "PRODUCTION_ADMIN")] },

    // notification inbox of the logged-in role (header bell + dashboard panels). Every role has one, so no permit():
    // the service scopes every query to req.user.role. No broadcastChanges: the service pushes its own live event after commit.
    { path: "/notifications", router: notificationRoutes },
    // phone / desktop notifications (Web Push) of the logged-in role: turn on / off for this browser
    { path: "/push", router: pushRoutes },

    // live updates (Server-Sent Events)
    { path: "/events", router: eventsRoutes },
];

function buildApiRouter() {
    const api = express.Router();

    for (const { path, router, resource, guards = [], public: isPublic = false } of MODULES) {
        const chain = isPublic ? [] : [authMiddleware, ...guards];
        if (resource) chain.push(broadcastChanges(resource));
        api.use(path, ...chain, router);
    }

    return api;
}

module.exports = { buildApiRouter, MODULES };

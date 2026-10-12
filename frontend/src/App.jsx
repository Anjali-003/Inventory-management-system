import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import { ToastProvider } from "./components/toast";
import LiveSync from "@/realtime/LiveSync";

import Dashboard from "@/features/dashboard/Dashboard";
import Products from "@/features/products/Products";
import Inventory from "@/features/inventory/Inventory";
import InventoryHistory from "@/features/inventory/InventoryHistory";
import Orders from "@/features/orders/Orders";
import Production from "@/features/production/Production";
import Login from "@/features/auth/Login";
import ProtectedRoute from "@/features/auth/ProtectedRoute";
import Employees from "@/features/employees/Employees";
import Attendance from "@/features/attendance/Attendance";
import QualityControl from "@/features/quality-control/QualityControl";
import FinishedGoods from "@/features/finished-goods/FinishedGoods";
import Activity from "@/features/activity/Activity";

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>

          {/* PUBLIC ROUTE */}

          <Route
            path="/login"
            element={<Login />}
          />

          {/* PROTECTED ROUTES */}

          <Route
            element={
              <ProtectedRoute>
                <LiveSync />
                <Layout />
              </ProtectedRoute>
            }
          >

            <Route
              path="/"
              element={<Dashboard />}
            />

          <Route path="/inventory-history" element={<InventoryHistory />} />

          <Route path="/activity" element={<Activity />} />

          <Route path="/orders" element={<Orders />} />
            <Route
              path="/products"
              element={<Products />}
            />

            <Route
              path="/inventory"
              element={<Inventory />}
            />

            <Route
              path="/orders"
              element={<Orders />}
            />

            <Route
              path="/production"
              element={<Production />}
            />

            <Route
              path="/quality-control"
              element={<QualityControl />}
            />

            <Route
              path="/finished-goods"
              element={<FinishedGoods />}
            />

            {/* <Route
              path="/existing-orders"
              element={<ExistingOrders />}
            /> */}

            <Route
              path="/employees"
              element={<Employees />}
            />

            <Route
              path="/attendance"
              element={<Attendance />}
            />

          </Route>

        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
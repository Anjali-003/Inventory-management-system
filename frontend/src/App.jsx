import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import { ToastProvider } from "./components/toast";

import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import InventoryHistory from "./pages/InventoryHistory";
import Orders from "./pages/Orders";
import Production from "./pages/Production";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import QualityControl from "./pages/QualityControl";
import FinishedGoods from "./pages/FinishedGoods";

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
                <Layout />
              </ProtectedRoute>
            }
          >

            <Route
              path="/"
              element={<Dashboard />}
            />

          <Route path="/inventory-history" element={<InventoryHistory />} />

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
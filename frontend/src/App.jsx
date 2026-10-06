// import { BrowserRouter, Routes, Route } from "react-router-dom";

// import Layout from "./components/Layout";

// import Dashboard from "./pages/Dashboard";
// import Products from "./pages/Products";
// import Inventory from "./pages/Inventory";
// import Orders from "./pages/Orders";
// import Production from "./pages/Production";
// import ExistingOrders from "./pages/ExistingOrders";
// import Login from "./pages/Login";
// import ProtectedRoute from "./components/ProtectedRoute";

// function App() {
//   return (
//     <BrowserRouter>
//       <Routes>
//         <Route element={<Layout />}>
//           <Route path="/login" element={<Login />} />

//           {/* PROTECTED */}

//           <Route
//             element={
//               <ProtectedRoute>
//                 <Layout />
//               </ProtectedRoute>
//             }
//           ></Route>
//           <Route path="/" element={<Dashboard />} />

//           <Route path="/products" element={<Products />} />

//           <Route path="/inventory" element={<Inventory />} />

//           <Route path="/orders" element={<Orders />} />

//           <Route path="/production" element={<Production />} />

//           <Route path="/existing-orders" element={<ExistingOrders />} />
//           <Route path="/login" element={<Login />} />
//         </Route>
//       </Routes>
//     </BrowserRouter>
//   );
// }

// export default App;

import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./components/Layout";
import { ToastProvider } from "./components/toast";

import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import InventoryHistory from "./pages/InventoryHistory";
import Orders from "./pages/Orders";
import Production from "./pages/Production";
// import ExistingOrders from "./pages/ExistingOrders";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";

function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        {/* PUBLIC ROUTE */}

        <Route path="/login" element={<Login />} />

        {/* PROTECTED ROUTES */}

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />

          <Route path="/products" element={<Products />} />

          <Route path="/inventory" element={<Inventory />} />

          <Route path="/inventory-history" element={<InventoryHistory />} />

          <Route path="/orders" element={<Orders />} />

          <Route path="/production" element={<Production />} />

          {/* <Route path="/existing-orders" element={<ExistingOrders />} /> */}
          <Route path="/employees" element={<Employees />} />
          <Route path="/attendance" element={<Attendance />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}

export default App;

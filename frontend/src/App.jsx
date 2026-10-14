import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "@/components/Layout";
import { ToastProvider } from "@/components/toast";
import LiveSync from "@/realtime/LiveSync";
import Login from "@/features/auth/Login";
import Landing from "@/features/landing/Landing";
import ProtectedRoute from "@/features/auth/ProtectedRoute";
import RequireAccess from "@/features/auth/RequireAccess";
import { LOGIN_PORTALS } from "@/lib/permissions";
import { PAGES } from "@/app/routes";

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* public: landing page, the first thing anyone sees */}
          <Route path="/" element={<Landing />} />

          {/* public: one login page per role (/login = super admin, /store-manager/login ...) */}
          {Object.values(LOGIN_PORTALS).map((portal) => (
            <Route key={portal.path} path={portal.path} element={<Login portal={portal} />} />
          ))}

          {/* protected: every page is wrapped in a permission check (see app/routes.jsx) */}
          <Route
            element={
              <ProtectedRoute>
                <LiveSync />
                <Layout />
              </ProtectedRoute>
            }
          >
            {PAGES.map(({ path, module, Page }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequireAccess module={module}>
                    <Page />
                  </RequireAccess>
                }
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
